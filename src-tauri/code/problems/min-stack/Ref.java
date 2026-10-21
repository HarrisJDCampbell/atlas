import java.util.*;

class RefMinStack {
    // Each entry remembers the minimum of everything at or below it, so popping restores the old min for free.
    private final Deque<int[]> stack = new ArrayDeque<>(); // {value, min so far}

    public RefMinStack() {}

    public void push(int val) {
        int min = stack.isEmpty() ? val : Math.min(val, stack.peek()[1]);
        stack.push(new int[]{val, min});
    }

    public void pop() { stack.pop(); }

    public int top() { return stack.peek()[0]; }

    public int getMin() { return stack.peek()[1]; }
}
