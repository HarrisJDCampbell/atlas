public class Main {
    public static void main(String[] args) {
        StringBuilder a = new StringBuilder("ab");
        StringBuilder b = new StringBuilder("ab");
        System.out.println(a.equals(b));
        System.out.println(a.toString().equals(b.toString()));
        StringBuilder r = a.reverse();
        System.out.println(a + " " + (r == a));
        a.insert(0, 'x').append(1);
        System.out.println(a);
        System.out.println(new StringBuilder().append('a' + 1));
    }
}
