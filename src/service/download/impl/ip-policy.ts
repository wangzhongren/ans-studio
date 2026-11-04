// src/service/download/impl/ip-policy.ts
// 下载 Service —— 公网 IP 判定（2026-11-04，download-requests B1）。
//
// 版本化拒绝清单 + 正向判定（方案 §5.2，复核 F5）：
//   · IPv4：命中任一拒绝段 ⇒ 不允许；
//   · IPv6：必须落在全局单播 `2000::/3`，且不在特殊段（Teredo/benchmarking/ORCHIDv1/v2/文档/6to4/3fff）。
// 本文件是纯函数、零依赖（只用 Node `net.isIP` 做字面量分类）；不声称穷尽 IANA 特殊用途段，
// 新增特殊段按安全修复补充。IPv4-mapped/NAT64 等因不在 `2000::/3` 自动拒绝，无需逐段枚举内嵌 IPv4。

import { isIP } from "node:net";

import type { IpDecision } from "../abstract/download-policy.ts";

interface Ipv4Range {
  /** 网络地址（无符号 32 位）。 */
  base: number;
  /** 前缀长度。 */
  prefix: number;
  label: string;
}

function ipv4ToInt(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    // 拒绝前导零/空段/非十进制：DNS 结果是规范写法，非规范输入按非法处理。
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    value = (value * 256) + octet;
  }
  return value >>> 0;
}

function maskFor(prefix: number): number {
  if (prefix === 0) return 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

/** IPv4 拒绝清单（版本 2026-11-04；方案 §5.2）。导出只读快照供测试/文档核对。 */
export const IPV4_REJECT_RANGES: readonly Ipv4Range[] = Object.freeze([
  { base: ipv4ToInt("0.0.0.0")!, prefix: 8, label: "0.0.0.0/8" },
  { base: ipv4ToInt("10.0.0.0")!, prefix: 8, label: "10.0.0.0/8" },
  { base: ipv4ToInt("100.64.0.0")!, prefix: 10, label: "100.64.0.0/10" },
  { base: ipv4ToInt("127.0.0.0")!, prefix: 8, label: "127.0.0.0/8" },
  { base: ipv4ToInt("169.254.0.0")!, prefix: 16, label: "169.254.0.0/16" },
  { base: ipv4ToInt("172.16.0.0")!, prefix: 12, label: "172.16.0.0/12" },
  { base: ipv4ToInt("192.0.0.0")!, prefix: 24, label: "192.0.0.0/24" },
  { base: ipv4ToInt("192.0.2.0")!, prefix: 24, label: "192.0.2.0/24" },
  { base: ipv4ToInt("192.168.0.0")!, prefix: 16, label: "192.168.0.0/16" },
  { base: ipv4ToInt("198.18.0.0")!, prefix: 15, label: "198.18.0.0/15" },
  { base: ipv4ToInt("198.51.100.0")!, prefix: 24, label: "198.51.100.0/24" },
  { base: ipv4ToInt("203.0.113.0")!, prefix: 24, label: "203.0.113.0/24" },
  { base: ipv4ToInt("224.0.0.0")!, prefix: 4, label: "224.0.0.0/4" },
  { base: ipv4ToInt("240.0.0.0")!, prefix: 4, label: "240.0.0.0/4" },
  { base: ipv4ToInt("255.255.255.255")!, prefix: 32, label: "255.255.255.255/32" },
]);

interface Ipv6Prefix {
  bytes: readonly number[];
  prefix: number;
  label: string;
}

/** IPv6 特殊段排除（`2000::/3` 内；方案 §5.2）。 */
export const IPV6_REJECT_PREFIXES: readonly Ipv6Prefix[] = Object.freeze([
  { bytes: [0x20, 0x01, 0x00, 0x00], prefix: 32, label: "2001::/32 (Teredo)" },
  { bytes: [0x20, 0x01, 0x00, 0x02, 0x00, 0x00], prefix: 48, label: "2001:2::/48 (benchmarking)" },
  { bytes: [0x20, 0x01, 0x00, 0x10], prefix: 28, label: "2001:10::/28 (ORCHIDv1)" },
  { bytes: [0x20, 0x01, 0x00, 0x20], prefix: 28, label: "2001:20::/28 (ORCHIDv2)" },
  { bytes: [0x20, 0x01, 0x0d, 0xb8], prefix: 32, label: "2001:db8::/32 (documentation)" },
  { bytes: [0x20, 0x02], prefix: 16, label: "2002::/16 (6to4)" },
  { bytes: [0x3f, 0xff, 0x00], prefix: 20, label: "3fff::/20 (documentation)" },
]);

function parseIpv4EmbeddedAtEnd(parts: string[]): number[] | undefined {
  const last = parts[parts.length - 1];
  if (last === undefined || !last.includes(".")) return undefined;
  const int = ipv4ToInt(last);
  if (int === undefined) return undefined;
  return [((int >>> 16) & 0xffff), (int & 0xffff)];
}

/** 解析 IPv6 为 16 字节；非法返回 undefined。支持 `::` 压缩与末尾内嵌 IPv4。 */
export function parseIpv6(address: string): Uint8Array | undefined {
  if (address === "" || address.includes("%") || /\s/.test(address)) return undefined;
  const doubleColon = address.indexOf("::");
  if (doubleColon !== -1 && address.indexOf("::", doubleColon + 2) !== -1) return undefined;
  const leftRaw = doubleColon === -1 ? address : address.slice(0, doubleColon);
  const rightRaw = doubleColon === -1 ? "" : address.slice(doubleColon + 2);
  const parseSide = (raw: string): number[] | undefined => {
    if (raw === "") return [];
    const parts = raw.split(":");
    if (parts.some((part) => part === "")) return undefined;
    const embedded = parseIpv4EmbeddedAtEnd(parts);
    const head = embedded === undefined ? parts : parts.slice(0, -1);
    const groups: number[] = [];
    for (const part of head) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return undefined;
      groups.push(Number.parseInt(part, 16));
    }
    if (embedded !== undefined) groups.push(...embedded);
    return groups;
  };
  const left = parseSide(leftRaw);
  const right = parseSide(rightRaw);
  if (left === undefined || right === undefined) return undefined;
  let groups: number[];
  if (doubleColon === -1) {
    if (left.length !== 8) return undefined;
    groups = left;
  } else {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return undefined;
    groups = [...left, ...new Array<number>(missing).fill(0), ...right];
  }
  if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
    return undefined;
  }
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = (group >>> 8) & 0xff;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

function matchesPrefix(bytes: Uint8Array, prefix: readonly number[], bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  for (let index = 0; index < fullBytes; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  const remainder = bits % 8;
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  return (bytes[fullBytes]! & mask) === (prefix[fullBytes]! & mask);
}

function classifyIpv4(address: string): IpDecision {
  const value = ipv4ToInt(address);
  if (value === undefined) return { allowed: false, family: 4, reason: "invalid-ipv4" };
  for (const range of IPV4_REJECT_RANGES) {
    if (((value & maskFor(range.prefix)) >>> 0) === range.base) {
      return { allowed: false, family: 4, reason: `rejected-range:${range.label}` };
    }
  }
  return { allowed: true, family: 4 };
}

function classifyIpv6(address: string): IpDecision {
  const bytes = parseIpv6(address);
  if (bytes === undefined) return { allowed: false, family: 6, reason: "invalid-ipv6" };
  // 正向判定：必须在全局单播 2000::/3（前 3 位 001）。
  if ((bytes[0]! & 0xe0) !== 0x20) {
    return { allowed: false, family: 6, reason: "not-global-unicast-2000::/3" };
  }
  for (const prefix of IPV6_REJECT_PREFIXES) {
    if (matchesPrefix(bytes, prefix.bytes, prefix.prefix)) {
      return { allowed: false, family: 6, reason: `rejected-range:${prefix.label}` };
    }
  }
  return { allowed: true, family: 6 };
}

/** 公网判定（唯一来源）。非法/不支持的字面量一律拒绝。 */
export function classifyIp(ip: string): IpDecision {
  const value = typeof ip === "string" ? ip.trim() : "";
  const version = isIP(value);
  if (version === 4) return classifyIpv4(value);
  if (version === 6) return classifyIpv6(value);
  return { allowed: false, family: 4, reason: "not-an-ip" };
}
