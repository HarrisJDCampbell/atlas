public class Main {
    static class Base {
        Base() { System.out.println("Base sees " + describe()); }
        String describe() { return "base"; }
    }
    static class Derived extends Base {
        private String label = "set";
        private int n = 5;
        Derived() { System.out.println("Derived sees " + describe()); }
        @Override String describe() { return label + " " + n; }
    }

    public static void main(String[] args) {
        new Derived();
    }
}
