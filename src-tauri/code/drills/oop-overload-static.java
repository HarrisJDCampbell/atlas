public class Main {
    static class Animal { String sound() { return "..."; } }
    static class Dog extends Animal { @Override String sound() { return "woof"; } }

    static String describe(Animal a) { return "animal"; }
    static String describe(Dog d) { return "dog"; }

    public static void main(String[] args) {
        Animal a = new Dog();
        System.out.println(a.sound());
        System.out.println(describe(a));
        System.out.println(describe((Dog) a));
        System.out.println(describe(new Dog()));
        System.out.println(describe(null));
    }
}
