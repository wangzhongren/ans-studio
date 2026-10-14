// 一个最小的异步事件队列，供假适配器与真实适配器共用。
//
// 归属：运行时核心私有辅助（src/common/runtime-core/）。
// 设计要点：
// - 用闭包而非 class，避免任何 TS 非可擦除语法（构造函数参数属性等）。
// - push 在 close 之后调用不报错（真实会话在 dispose 后仍可能有迟到事件）。
// - 迭代器在队列清空且已 close 时正常结束；否则等待下一个 push。

/** 异步事件队列：写入端 push/close，读取端是 AsyncIterable。 */
export interface EventQueue<T> {
  push(event: T): void;
  close(): void;
  readonly stream: AsyncIterable<T>;
}

export function createEventQueue<T>(): EventQueue<T> {
  const buffer: T[] = [];
  let closed = false;
  let wake: (() => void) | undefined;

  function signal(): void {
    if (wake) {
      const w = wake;
      wake = undefined;
      w();
    }
  }

  function next(): Promise<IteratorResult<T>> {
    if (buffer.length > 0) {
      // 非空断言在运行期就是普通取值；buffer.length > 0 保证已定义。
      return Promise.resolve({ value: buffer.shift() as T, done: false });
    }
    if (closed) {
      return Promise.resolve({ value: undefined as unknown as T, done: true });
    }
    return new Promise<IteratorResult<T>>((resolve) => {
      wake = () => {
        if (buffer.length > 0) {
          resolve({ value: buffer.shift() as T, done: false });
        } else {
          resolve({ value: undefined as unknown as T, done: true });
        }
      };
    });
  }

  const stream: AsyncIterable<T> = {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return { next };
    },
  };

  return {
    push(event: T): void {
      if (closed) return;
      buffer.push(event);
      signal();
    },
    close(): void {
      closed = true;
      signal();
    },
    stream,
  };
}
