public class Main {
    @SuppressWarnings("finally")
    static int f() {
        try { return 1; } finally { return 2; }
    }
    @SuppressWarnings("finally")
    static int g() {
        try { throw new IllegalStateException("boom"); } finally { return 3; }
    }
    static String h() {
        try {
            System.out.println("try");
            return "from try";
        } finally {
            System.out.println("finally");
        }
    }

    public static void main(String[] args) {
        System.out.println(f());
        System.out.println(g());
        System.out.println(h());
    }
}
