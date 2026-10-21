import java.util.*;

// Comparison, copying and printing for any value a problem returns.
final class Judge {
    private Judge() {}

    /** Deep, order-sensitive equality across arrays, lists, maps, nodes and boxed values. */
    static boolean eq(Object a, Object b) {
        if (a == b) return true;
        if (a == null || b == null) return false;
        if (a instanceof ListNode || b instanceof ListNode)
            return a instanceof ListNode && b instanceof ListNode && ListNode.values((ListNode) a).equals(ListNode.values((ListNode) b));
        if (a instanceof TreeNode || b instanceof TreeNode)
            return a instanceof TreeNode && b instanceof TreeNode && TreeNode.levels((TreeNode) a).equals(TreeNode.levels((TreeNode) b));
        if (a instanceof Double || a instanceof Float || b instanceof Double || b instanceof Float) {
            if (!(a instanceof Number) || !(b instanceof Number)) return false;
            double x = ((Number) a).doubleValue(), y = ((Number) b).doubleValue();
            return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x));
        }
        if (a.getClass().isArray() || b.getClass().isArray() || a instanceof List || b instanceof List) {
            List<Object> x = asList(a), y = asList(b);
            if (x == null || y == null || x.size() != y.size()) return false;
            for (int i = 0; i < x.size(); i++) if (!eq(x.get(i), y.get(i))) return false;
            return true;
        }
        if (a instanceof Map && b instanceof Map) {
            Map<?, ?> x = (Map<?, ?>) a, y = (Map<?, ?>) b;
            if (x.size() != y.size()) return false;
            for (Map.Entry<?, ?> e : x.entrySet()) if (!y.containsKey(e.getKey()) || !eq(e.getValue(), y.get(e.getKey()))) return false;
            return true;
        }
        if (a instanceof Number && b instanceof Number && !(a instanceof Double) && !(b instanceof Double))
            return ((Number) a).longValue() == ((Number) b).longValue();
        return a.equals(b);
    }

    /** Equal as multisets: order doesn't matter at the top level. */
    static boolean sameBag(Object a, Object b) {
        List<Object> x = asList(a), y = asList(b);
        if (x == null || y == null) return eq(a, b);
        return sortedShows(x, false).equals(sortedShows(y, false));
    }

    /** Equal as multisets at both levels, e.g. a list of groups where neither order matters. */
    static boolean sameBagDeep(Object a, Object b) {
        List<Object> x = asList(a), y = asList(b);
        if (x == null || y == null) return eq(a, b);
        return sortedShows(x, true).equals(sortedShows(y, true));
    }

    private static List<String> sortedShows(List<Object> xs, boolean inner) {
        List<String> out = new ArrayList<>();
        for (Object o : xs) {
            List<Object> l = inner ? asList(o) : null;
            out.add(l == null ? show(o, Integer.MAX_VALUE) : String.join("\u0001", sortedShows(l, false)));
        }
        Collections.sort(out);
        return out;
    }

    /** Any array or list as a List<Object>, or null if it's neither. */
    static List<Object> asList(Object o) {
        if (o instanceof List) return new ArrayList<>((List<?>) o);
        if (o == null || !o.getClass().isArray()) return null;
        int n = java.lang.reflect.Array.getLength(o);
        List<Object> out = new ArrayList<>(n);
        for (int i = 0; i < n; i++) out.add(java.lang.reflect.Array.get(o, i));
        return out;
    }

    /** Deep copy, so a solution that mutates its input can't change what the reference sees. */
    static Object copy(Object o) {
        if (o == null) return null;
        if (o instanceof int[]) return ((int[]) o).clone();
        if (o instanceof long[]) return ((long[]) o).clone();
        if (o instanceof char[]) return ((char[]) o).clone();
        if (o instanceof double[]) return ((double[]) o).clone();
        if (o instanceof boolean[]) return ((boolean[]) o).clone();
        if (o instanceof byte[]) return ((byte[]) o).clone();
        if (o instanceof Object[]) {
            Object[] src = (Object[]) o;
            Object[] dst = (Object[]) java.lang.reflect.Array.newInstance(src.getClass().getComponentType(), src.length);
            for (int i = 0; i < src.length; i++) dst[i] = copy(src[i]);
            return dst;
        }
        if (o instanceof List) {
            List<Object> out = new ArrayList<>();
            for (Object x : (List<?>) o) out.add(copy(x));
            return out;
        }
        if (o instanceof ListNode) return copyList((ListNode) o);
        if (o instanceof TreeNode) return copyTree((TreeNode) o);
        return o; // strings, boxed values and records are immutable
    }

    /** Node by node, any length; a cycle is cut after 50M nodes rather than hanging. */
    private static ListNode copyList(ListNode head) {
        ListNode dummy = new ListNode(), cur = dummy;
        int n = 0;
        for (ListNode x = head; x != null && n < 50_000_000; x = x.next, n++) { cur.next = new ListNode(x.val); cur = cur.next; }
        return dummy.next;
    }

    /** Iterative, so a million-deep skewed tree copies without recursion. */
    private static TreeNode copyTree(TreeNode root) {
        if (root == null) return null;
        TreeNode out = new TreeNode(root.val);
        Deque<TreeNode[]> st = new ArrayDeque<>();
        st.push(new TreeNode[]{root, out});
        while (!st.isEmpty()) {
            TreeNode[] pr = st.pop();
            if (pr[0].left != null) { pr[1].left = new TreeNode(pr[0].left.val); st.push(new TreeNode[]{pr[0].left, pr[1].left}); }
            if (pr[0].right != null) { pr[1].right = new TreeNode(pr[0].right.val); st.push(new TreeNode[]{pr[0].right, pr[1].right}); }
        }
        return out;
    }

    static Object[] copyAll(Object[] in) {
        Object[] out = new Object[in.length];
        for (int i = 0; i < in.length; i++) out[i] = copy(in[i]);
        return out;
    }

    static String show(Object o) { return show(o, 400); }

    static String show(Object o, int max) {
        StringBuilder sb = new StringBuilder();
        write(sb, o, max);
        if (sb.length() > max) { sb.setLength(max); sb.append("…"); }
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object o, int max) {
        if (sb.length() > max) return;
        if (o == null) { sb.append("null"); return; }
        if (o instanceof String) { sb.append('"').append(o).append('"'); return; }
        if (o instanceof Character) { sb.append('\'').append(o).append('\''); return; }
        if (o instanceof ListNode) { write(sb, ListNode.values((ListNode) o), max); return; }
        if (o instanceof TreeNode) { write(sb, TreeNode.levels((TreeNode) o), max); return; }
        if (o instanceof Double || o instanceof Float) {
            double d = ((Number) o).doubleValue();
            sb.append(d == Math.rint(d) && Math.abs(d) < 1e15 ? String.format("%.1f", d) : String.format("%.5f", d));
            return;
        }
        if (o instanceof char[]) { sb.append('"').append(new String((char[]) o)).append('"'); return; }
        List<Object> l = asList(o);
        if (l != null) {
            sb.append('[');
            for (int i = 0; i < l.size(); i++) {
                if (i > 0) sb.append(", ");
                write(sb, l.get(i), max);
                if (sb.length() > max) return;
            }
            sb.append(']');
            return;
        }
        if (o instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : new TreeMap<>((Map<?, ?>) o).entrySet()) {
                if (!first) sb.append(", ");
                first = false;
                write(sb, e.getKey(), max);
                sb.append('=');
                write(sb, e.getValue(), max);
            }
            sb.append('}');
            return;
        }
        sb.append(o);
    }

    // ---- input generators shared by problems ----

    static int[] ints(Random r, int n, int lo, int hi) {
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = lo + r.nextInt(hi - lo + 1);
        return a;
    }

    static String str(Random r, int n, String alphabet) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) sb.append(alphabet.charAt(r.nextInt(alphabet.length())));
        return sb.toString();
    }
}
