public class Main {
    static class Res implements AutoCloseable {
        final String name;
        Res(String name) { this.name = name; System.out.println("open " + name); }
        @Override public void close() { System.out.println("close " + name); }
    }

    public static void main(String[] args) {
        try (Res a = new Res("a"); Res b = new Res("b")) {
            throw new IllegalStateException("body");
        } catch (IllegalStateException e) {
            System.out.println("caught " + e.getMessage());
        } finally {
            System.out.println("finally");
        }
    }
}
