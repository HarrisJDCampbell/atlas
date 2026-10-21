public class Main {
    static class A {
        String name = "A";
        String getName() { return name; }
    }
    static class B extends A {
        String name = "B";
        @Override String getName() { return name; }
    }
    static class C extends A {
        String name = "C";
    }

    public static void main(String[] args) {
        A ab = new B();
        System.out.println(ab.name);
        System.out.println(ab.getName());
        System.out.println(((B) ab).name);
        A ac = new C();
        System.out.println(ac.getName());
    }
}
