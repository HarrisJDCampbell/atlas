const SUP: Record<string, string> = { "2": "²", "3": "³", n: "ⁿ", k: "ᵏ", t: "ᵗ", L: "ᴸ", m: "ᵐ" };

/** n^2 → O(n²), n·2^n → O(n·2ⁿ): written the way you'd write it on a whiteboard. */
export const bigO = (t: string) => `O(${t.replace(/\^(.)/g, (_, c: string) => SUP[c] ?? c)})`;
