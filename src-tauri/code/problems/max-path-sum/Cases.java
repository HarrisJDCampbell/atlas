import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{TreeNode.of(1, 2, 3)},
            new Object[]{TreeNode.of(-10, 9, 20, null, null, 15, 7)},
            new Object[]{TreeNode.of(-3)},
            new Object[]{TreeNode.of(-1, -2, -3)},
            new Object[]{TreeNode.of(2, -1)},
            new Object[]{TreeNode.of(-2, 1)},
            new Object[]{TreeNode.of(5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1)},
            new Object[]{TreeNode.of(1, -2, -3, 1, 3, -2, null, -1)},
            new Object[]{TreeNode.of(10, -100, -100, 50, 50)},
            new Object[]{TreeNode.of(1, null, 2, null, 3)},
            new Object[]{TreeNode.of(-5, 4, 3, -1, -1)},
            new Object[]{TreeNode.of(0)},
            new Object[]{TreeNode.of(-1000, -1000, -1000)}
        );
    }

    static Object[] random(Random r, int size) { return new Object[]{randomTree(r, Math.max(1, size), -10, 10)}; }

    /** A zigzag spine of n/2 nodes with leaves, random values: height n/2, so recomputing subtree sums is n^2. */
    static Object[] bench(Random r, int n) {
        int[] val = new int[n], left = new int[n], right = new int[n];
        Arrays.fill(left, -1);
        Arrays.fill(right, -1);
        for (int i = 0; i < n; i++) val[i] = r.nextInt(2001) - 1000;
        int spine = (n + 1) / 2, leaf = spine;
        for (int i = 0; i + 1 < spine; i++) {
            boolean goLeft = r.nextBoolean();
            if (goLeft) left[i] = i + 1; else right[i] = i + 1;
            if (leaf < n) { if (goLeft) right[i] = leaf++; else left[i] = leaf++; }
        }
        if (leaf < n) left[spine - 1] = leaf++;
        return new Object[]{build(val, left, right)};
    }

    static Object run(Object[] in) { return new Solution().maxPathSum((TreeNode) in[0]); }
    static Object ref(Object[] in) { return new Ref().maxPathSum((TreeNode) in[0]); }

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

    /** A random shape with `size` nodes: each new node hangs off a random free slot. */
    static TreeNode randomTree(Random r, int size, int lo, int hi) {
        if (size <= 0) return null;
        List<TreeNode> nodes = new ArrayList<>();
        nodes.add(new TreeNode(lo + r.nextInt(hi - lo + 1)));
        while (nodes.size() < size) {
            TreeNode p = nodes.get(r.nextInt(nodes.size()));
            TreeNode c = new TreeNode(lo + r.nextInt(hi - lo + 1));
            if (r.nextBoolean()) { if (p.left == null) { p.left = c; nodes.add(c); } }
            else if (p.right == null) { p.right = c; nodes.add(c); }
        }
        return nodes.get(0);
    }
}
