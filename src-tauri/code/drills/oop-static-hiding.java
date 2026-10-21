public class Main {
    static class Parent {
        static String who() { return "parent"; }
        String me() { return "parent"; }
    }
    static class Child extends Parent {
        static String who() { return "child"; }
        @Override String me() { return "child"; }
    }

    public static void main(String[] args) {
        Parent p = new Child();
        System.out.println(p.who());
        System.out.println(p.me());
        System.out.println(Child.who());
        System.out.println(((Child) p).who());
    }
}
