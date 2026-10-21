class Ref {
    public int largestRectangleArea(int[] heights) {
        int n = heights.length;
        int[] stack = new int[n + 1]; // indices of bars with strictly increasing heights
        int top = 0;
        long best = 0;
        for (int i = 0; i <= n; i++) {
            int h = i == n ? 0 : heights[i]; // a height-0 sentinel flushes the stack at the end
            while (top > 0 && heights[stack[top - 1]] >= h) {
                int height = heights[stack[--top]];
                int left = top == 0 ? -1 : stack[top - 1]; // first shorter bar to the left
                best = Math.max(best, (long) height * (i - left - 1));
            }
            stack[top++] = i;
        }
        return (int) best;
    }
}
