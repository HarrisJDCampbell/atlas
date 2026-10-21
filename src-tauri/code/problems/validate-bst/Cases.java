import java.util.*;

final class Cases {
    static final int MIN = Integer.MIN_VALUE, MAX = Integer.MAX_VALUE;

    static List<Object[]> fixed() {
        return List.of(
            new Object[]{TreeNode.of(2, 1, 3)},
            new Object[]{TreeNode.of(5, 1, 4, null, null, 3, 6)},
            new Object[]{TreeNode.of(5, 4, 6, null, null, 3, 7)},
            new Object[]{TreeNode.of(1)},
            new Object[]{TreeNode.of(2, 2, 2)},
            new Object[]{TreeNode.of(1, null, 1)},
            new Object[]{TreeNode.of(10, 5, 15, null, null, 6, 20)},
            new Object[]{TreeNode.of(3, 1, 5, 0, 2, 4, 6)},
            new Object[]{TreeNode.of(MAX)},
            new Object[]{TreeNode.of(MIN)},
            new Object[]{TreeNode.of(MIN, null, MAX)},
            new Object[]{TreeNode.of(MAX, MIN)},
            new Object[]{TreeNode.of(0, MIN, MAX)},
            new Object[]{TreeNode.of(MIN, MIN)},
            new Object[]{TreeNode.of(MAX, null, MAX)},
            new Object[]{TreeNode.of(MAX, MAX)}
        );
    }

    /** A random BST of distinct values; half the time one node is overwritten, which may or may not break it. */
    static Object[] random(Random r, int size) {
        int n = Math.max(1, size);
        List<Integer> pool = new ArrayList<>();
        for (int v = -20; v <= 20; v++) pool.add(v);
        Collections.shuffle(pool, r);
        TreeNode root = null;
        List<TreeNode> nodes = new ArrayList<>();
        for (int i = 0; i < Math.min(n, pool.size()); i++) {
            TreeNode c = new TreeNode(pool.get(i));
            nodes.add(c);
            if (root == null) { root = c; continue; }
            TreeNode p = root;
            while (true) {
                if (c.val < p.val) { if (p.left == null) { p.left = c; break; } p = p.left; }
                else { if (p.right == null) { p.right = c; break; } p = p.right; }
            }
        }
        if (r.nextBoolean()) {
            TreeNode t = nodes.get(r.nextInt(nodes.size()));
            int roll = r.nextInt(10);
            t.val = roll == 0 ? MIN : roll == 1 ? MAX : r.nextInt(41) - 20;
        }
        return new Object[]{root};
    }

    /** A valid BST shaped as a zigzag spine with leaves (height n/2): everything must be checked, and a naive check is n^2. */
    static Object[] bench(Random r, int n) {
        int[] val = new int[n], left = new int[n], right = new int[n];
        Arrays.fill(left, -1);
        Arrays.fill(right, -1);
        int spine = (n + 1) / 2, leaf = spine;
        for (int i = 0; i + 1 < spine; i++) {
            boolean goLeft = r.nextBoolean();
            if (goLeft) left[i] = i + 1; else right[i] = i + 1;
            if (leaf < n) { if (goLeft) right[i] = leaf++; else left[i] = leaf++; }
        }
        if (leaf < n) left[spine - 1] = leaf++;
        // label nodes by in-order rank so the tree is a valid BST
        int[] stack = new int[n];
        int top = 0, cur = 0, rank = 0;
        while (cur >= 0 || top > 0) {
            while (cur >= 0) { stack[top++] = cur; cur = left[cur]; }
            cur = stack[--top];
            val[cur] = 2 * rank++ - n;
            cur = right[cur];
        }
        return new Object[]{build(val, left, right)};
    }

    static Object run(Object[] in) { return new Solution().isValidBST((TreeNode) in[0]); }
    static Object ref(Object[] in) { return new Ref().isValidBST((TreeNode) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }

    // ---- trees ----

    /** Links nodes from index arrays (iteratively, so a deep bench tree is fine). Node 0 is the root. */
    static TreeNode build(int[] val, int[] left, int[] right) {
        int n = val.length;
        if (n == 0) return null;
        TreeNode[] nodes = new TreeNode[n];
        for (int i = 0; i < n; i++) nodes[i] = new TreeNode(val[i]);
        for (int i = 0; i < n; i++) {
            if (left[i] >= 0) nodes[i].left = nodes[left[i]];
            if (right[i] >= 0) nodes[i].right = nodes[right[i]];
        }
        return nodes[0];
    }
}
