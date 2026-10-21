public class Main {
    public static void main(String[] args) {
        String a = "hello";
        String b = "hel" + "lo";
        String part = "hel";
        String c = part + "lo";
        final String fixed = "hel";
        String d = fixed + "lo";
        System.out.println(a == b);
        System.out.println(a == c);
        System.out.println(a.equals(c));
        System.out.println(a == c.intern());
        System.out.println(a == d);
    }
}
