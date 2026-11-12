// シード付き乱数(mulberry32)。状態は uint32 1つなので GameState に入れて持ち運べる。

export function seedFrom(value: number | string): number {
  if (typeof value === 'number') return value >>> 0;
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 純粋関数版:[0,1) の値と次の状態を返す */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** 呼び出し側で持つ可変の乱数(CPU の思考やシミュレーター用) */
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  readonly state: number;
}

export function createRng(seed: number | string): Rng {
  let s = seedFrom(seed);
  return {
    next() {
      const [v, n] = nextRandom(s);
      s = n;
      return v;
    },
    int(maxExclusive: number) {
      return Math.floor(this.next() * maxExclusive);
    },
    get state() {
      return s;
    },
  };
}

/** Fisher-Yates。配列をその場で並べ替え、新しい乱数状態を返す */
export function shuffleInPlace<T>(arr: T[], state: number): number {
  let s = state;
  for (let i = arr.length - 1; i > 0; i--) {
    const [v, n] = nextRandom(s);
    s = n;
    const j = Math.floor(v * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return s;
}
