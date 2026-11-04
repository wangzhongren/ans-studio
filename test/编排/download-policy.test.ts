// test/编排/download-policy.test.ts
// B1（2026-11-04 download-requests）：下载 Service 纯规则。
//
// 覆盖 AC-7/AC-8/AC-11/AC-25 的 Service 层：
//   · URL 协议/凭据/端口/主机归一化/punycode/IPv6；
//   · IPv4 拒绝清单 + IPv6 2000::/3 正向 + Teredo/6to4/ORCHID/文档段；
//   · 同域/降级；文件名两阶段优先级与净化真值表；配置解析；judge facts ≤2KiB。

import test from "node:test";
import assert from "node:assert/strict";

import type { DownloadJudgeFacts } from "../../src/model/download.ts";
import {
  DOWNLOAD_DEFAULT_CONNECT_TIMEOUT_MS,
  DOWNLOAD_DEFAULT_IDLE_TIMEOUT_MS,
  DOWNLOAD_DEFAULT_MAX_BYTES,
  DOWNLOAD_DEFAULT_TOTAL_TIMEOUT_MS,
  DOWNLOAD_JUDGE_FACTS_MAX_BYTES,
} from "../../src/model/download.ts";
import { checkUrl, isSameHostForRedirect } from "../../src/service/download/impl/url-policy.ts";
import { classifyIp } from "../../src/service/download/impl/ip-policy.ts";
import {
  pickCardFilename,
  pickExecutionFilename,
  sanitizeFilename,
} from "../../src/service/download/impl/filename.ts";
import {
  DOWNLOAD_ENV_CONNECT_TIMEOUT_MS,
  DOWNLOAD_ENV_MAX_BYTES,
  resolveDownloadConfig,
} from "../../src/service/download/impl/config.ts";
import { boundJudgeFacts, createDownloadPolicy } from "../../src/service/download/public/download-service.ts";

function okUrl(raw: string) {
  const result = checkUrl(raw);
  assert.equal(result.ok, true, `expected ok URL: ${raw} (${result.ok ? "" : result.reason})`);
  if (!result.ok) throw new Error("unreachable");
  return result.url;
}

test("URL：仅 http/https；拒绝 userinfo/空 host/超长", () => {
  for (const raw of ["file:///etc/passwd", "ftp://example.com/x", "data:text/plain,hi", "ws://example.com/"]) {
    const result = checkUrl(raw);
    assert.equal(result.ok, false, raw);
    if (!result.ok) assert.equal(result.code, "download-unsafe-url");
  }
  const userinfo = checkUrl("http://user:pass@example.com/x");
  assert.equal(userinfo.ok, false);
  const empty = checkUrl("http://");
  assert.equal(empty.ok, false);
  const long = checkUrl(`http://example.com/${"a".repeat(2100)}`);
  assert.equal(long.ok, false);
});

test("URL：主机归一化（小写/去尾点/punycode/IPv6 去括号）+ 显式端口", () => {
  const simple = okUrl("HTTP://Example.COM.:8080/a?b=1#hash");
  assert.equal(simple.scheme, "http");
  assert.equal(simple.host, "example.com");
  assert.equal(simple.port, 8080);
  assert.equal(simple.url, "http://example.com:8080/a?b=1");
  assert.equal(simple.hostForTls, "example.com");

  const puny = okUrl("https://bücher.example/");
  assert.equal(puny.host, "xn--bcher-kva.example");

  const v6 = okUrl("http://[2606:4700::1111]:8443/x");
  assert.equal(v6.host, "2606:4700::1111");
  assert.equal(v6.port, 8443);
  assert.equal(v6.url, "http://[2606:4700::1111]:8443/x");
  assert.equal(v6.hostForTls, undefined);
});

test("IPv4 拒绝清单（含边界）与公网样本", () => {
  const rejected = [
    "0.0.0.1", "10.1.2.3", "100.64.0.1", "100.127.255.255", "127.0.0.1",
    "169.254.1.1", "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1",
    "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1",
    "240.0.0.1", "255.255.255.255",
  ];
  for (const ip of rejected) {
    const decision = classifyIp(ip);
    assert.equal(decision.allowed, false, ip);
    assert.equal(decision.family, 4);
  }
  for (const ip of ["93.184.216.34", "1.1.1.1", "8.8.8.8", "172.15.255.255", "172.32.0.0", "100.63.255.255", "100.128.0.1"]) {
    assert.equal(classifyIp(ip).allowed, true, ip);
  }
});

test("IPv6：2000::/3 正向 + 特殊段排除；IPv4-mapped/NAT64 自动拒绝", () => {
  const rejected = [
    "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "64:ff9b::1",
    "2002::1", "2001::1", "2001:2::1", "2001:10::1", "2001:20::1",
    "2001:db8::1", "3fff::1", "ff00::1",
  ];
  for (const ip of rejected) {
    assert.equal(classifyIp(ip).allowed, false, ip);
  }
  for (const ip of ["2001:4860:4860::8888", "2606:4700::1111", "2a00:1450:4001::1"]) {
    assert.equal(classifyIp(ip).allowed, true, ip);
  }
  assert.equal(classifyIp("not-an-ip").allowed, false);
  assert.equal(classifyIp("1.2.3").allowed, false);
  assert.equal(classifyIp("999.1.1.1").allowed, false);
  assert.equal(classifyIp("fe80::1%eth0").allowed, false);
});

test("同域：host 归一相等（端口可不同）；https→http 降级拒绝；子域跨域", () => {
  const from = okUrl("https://example.com/a");
  assert.equal(isSameHostForRedirect(from, okUrl("https://example.com:8443/b")).kind, "same");
  assert.equal(isSameHostForRedirect(from, okUrl("https://EXAMPLE.com./b")).kind, "same");
  assert.equal(isSameHostForRedirect(from, okUrl("http://example.com/b")).kind, "scheme-downgrade");
  assert.equal(isSameHostForRedirect(from, okUrl("https://sub.example.com/b")).kind, "cross-host");
  assert.equal(isSameHostForRedirect(okUrl("http://example.com/a"), okUrl("https://example.com/b")).kind, "same");
});

test("文件名净化真值表（穿越/非法字符/尾点空格/前导点/保留名/超长）", () => {
  assert.equal(sanitizeFilename("..\\..\\evil.txt").name, "_.._evil.txt");
  assert.equal(sanitizeFilename("a/b\\c").name, "a_b_c");
  assert.equal(sanitizeFilename('a<b>c:d"e|f?g*h').name, "a_b_c_d_e_f_g_h");
  assert.equal(sanitizeFilename("foo. ").name, "foo");
  assert.equal(sanitizeFilename(".hidden").name, "hidden");
  assert.equal(sanitizeFilename("CON").name, "_CON");
  assert.equal(sanitizeFilename("NUL.txt").name, "_NUL.txt");
  assert.equal(sanitizeFilename("\u0000\u0001name\u007f").name, "name");
  const long = sanitizeFilename("a".repeat(300)).name;
  assert.ok(Array.from(long).length <= 128);
  assert.ok(Buffer.byteLength(long, "utf8") <= 200);
  const longExt = sanitizeFilename(`${"a".repeat(300)}.tar.gz`).name;
  assert.ok(Array.from(longExt).length <= 128);
  assert.ok(longExt.endsWith(".gz"));
  assert.equal(sanitizeFilename("   ").name, "");
  assert.equal(sanitizeFilename("_").name, "_");
});

test("卡片阶段文件名：URL basename → caller → 兜底；不返回 content-disposition", () => {
  const url = okUrl("http://example.com/files/report.pdf");
  assert.deepEqual(pickCardFilename({ url, callerSuggestion: "mine.txt" }), { name: "report.pdf", source: "url-basename" });
  const dirUrl = okUrl("http://example.com/files/");
  assert.deepEqual(pickCardFilename({ url: dirUrl, callerSuggestion: "my file.txt" }), { name: "my file.txt", source: "caller" });
  const fixed = new Date("2026-11-04T12:34:56.000Z");
  assert.deepEqual(pickCardFilename({ url: dirUrl, now: fixed }), { name: "download-20261104-123456", source: "fallback" });
  assert.deepEqual(pickCardFilename({ url: dirUrl, callerSuggestion: "_", now: fixed }), {
    name: "download-20261104-123456",
    source: "fallback",
  });
});

test("执行阶段文件名：Content-Disposition（filename* 优先）→ URL basename → caller → 兜底", () => {
  const url = okUrl("http://example.com/files/report.pdf");
  assert.deepEqual(
    pickExecutionFilename({ url, contentDisposition: 'attachment; filename="server.bin"' }),
    { name: "server.bin", source: "content-disposition" },
  );
  assert.deepEqual(
    pickExecutionFilename({
      url,
      contentDisposition: "attachment; filename=\"plain.txt\"; filename*=UTF-8''%E6%96%87%E4%BB%B6.txt",
    }),
    { name: "文件.txt", source: "content-disposition" },
  );
  assert.deepEqual(
    pickExecutionFilename({ url, contentDisposition: 'attachment; filename="..\\evil.bin"' }),
    { name: "_evil.bin", source: "content-disposition" },
  );
  assert.deepEqual(
    pickExecutionFilename({ url, contentDisposition: "attachment; filename*=UTF-8''%E0%A4%A" }),
    { name: "report.pdf", source: "url-basename" },
  );
});

test("配置：默认值来自 A1 常量；非法 env 回退并返回诊断；合法 env 覆盖", () => {
  const defaults = resolveDownloadConfig({});
  assert.equal(defaults.config.maxBytes, DOWNLOAD_DEFAULT_MAX_BYTES);
  assert.equal(defaults.config.connectTimeoutMs, DOWNLOAD_DEFAULT_CONNECT_TIMEOUT_MS);
  assert.equal(defaults.config.idleTimeoutMs, DOWNLOAD_DEFAULT_IDLE_TIMEOUT_MS);
  assert.equal(defaults.config.totalTimeoutMs, DOWNLOAD_DEFAULT_TOTAL_TIMEOUT_MS);
  assert.equal(defaults.config.maxRedirects, 5);
  assert.equal(defaults.config.executableConcurrency, 2);
  assert.deepEqual(defaults.diagnostics, []);

  const invalid = resolveDownloadConfig({
    [DOWNLOAD_ENV_MAX_BYTES]: "-1",
    [DOWNLOAD_ENV_CONNECT_TIMEOUT_MS]: "abc",
  } as NodeJS.ProcessEnv);
  assert.equal(invalid.config.maxBytes, DOWNLOAD_DEFAULT_MAX_BYTES);
  assert.equal(invalid.config.connectTimeoutMs, DOWNLOAD_DEFAULT_CONNECT_TIMEOUT_MS);
  assert.equal(invalid.diagnostics.length, 2);

  const custom = resolveDownloadConfig({
    [DOWNLOAD_ENV_MAX_BYTES]: "1024",
    [DOWNLOAD_ENV_CONNECT_TIMEOUT_MS]: "2000",
  } as NodeJS.ProcessEnv);
  assert.equal(custom.config.maxBytes, 1024);
  assert.equal(custom.config.connectTimeoutMs, 2000);

  const policy = createDownloadPolicy({ env: { [DOWNLOAD_ENV_MAX_BYTES]: "2048" } as NodeJS.ProcessEnv });
  assert.equal(policy.resolveConfig().config.maxBytes, 2048);
});

test("judge facts ≤2KiB：只截断 url/purpose，校验字段不变", () => {
  const facts: DownloadJudgeFacts = {
    url: `https://example.com/${"p".repeat(1900)}?token=${"t".repeat(100)}`,
    scheme: "https",
    host: "example.com",
    port: 8443,
    resolvedIps: ["93.184.216.34", "2606:4700:4700::1111", "1.1.1.1", "8.8.8.8", "9.9.9.9", "149.112.112.112", "208.67.222.222", "208.67.220.220"],
    resolvedIpsTotal: 9,
    resolvedIpsTruncated: true,
    filename: "x".repeat(128),
    filenameSource: "url-basename",
    purpose: "用".repeat(500),
    maxBytes: DOWNLOAD_DEFAULT_MAX_BYTES,
    mechanical: {
      schemeOk: true,
      credentialsAbsent: true,
      hostPublic: true,
      ipsPublic: true,
      filenameSafe: true,
    },
  };
  const bounded = boundJudgeFacts(facts);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded), "utf8") <= DOWNLOAD_JUDGE_FACTS_MAX_BYTES);
  assert.equal(bounded.scheme, facts.scheme);
  assert.equal(bounded.host, facts.host);
  assert.deepEqual(bounded.resolvedIps, facts.resolvedIps);
  assert.equal(bounded.resolvedIpsTotal, facts.resolvedIpsTotal);
  assert.equal(bounded.resolvedIpsTruncated, facts.resolvedIpsTruncated);
  assert.deepEqual(bounded.mechanical, facts.mechanical);
  assert.ok(bounded.url.startsWith("https://example.com"));
  assert.notEqual(bounded.url, facts.url);
  assert.notEqual(bounded.purpose, facts.purpose);
  // 未超限时原样返回。
  const small = { ...facts, url: "https://example.com/a", purpose: "small" };
  assert.deepEqual(boundJudgeFacts(small), small);
});
