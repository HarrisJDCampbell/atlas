// Helper classes live inside the Ref class so they never collide with yours.
class RefTrie {
    private static final class Node {
        final Node[] next = new Node[26];
        boolean word; // a whole inserted word ends here
    }

    private final Node root = new Node();

    public RefTrie() {}

    public void insert(String word) {
        Node n = root;
        for (int i = 0; i < word.length(); i++) {
            int c = word.charAt(i) - 'a';
            if (n.next[c] == null) n.next[c] = new Node();
            n = n.next[c];
        }
        n.word = true;
    }

    public boolean search(String word) {
        Node n = walk(word);
        return n != null && n.word;
    }

    public boolean startsWith(String prefix) {
        return walk(prefix) != null;
    }

    /** The node reached by following s from the root, or null if the path falls off the trie. */
    private Node walk(String s) {
        Node n = root;
        for (int i = 0; i < s.length() && n != null; i++) n = n.next[s.charAt(i) - 'a'];
        return n;
    }
}
