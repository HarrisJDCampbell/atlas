public class Main {
    static int value() {
        int x = 1;
        try { return x; } finally { x = 99; }
    }
    static int[] array() {
        int[] a = {1};
        try { return a; } finally { a[0] = 99; }
    }

    public static void main(String[] args) {
        System.out.println(value());
        System.out.println(array()[0]);
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < 3; i++) {
            try {
                if (i == 1) continue;
                out.append(i);
            } finally {
                out.append('f');
            }
        }
        System.out.println(out);
    }
}
