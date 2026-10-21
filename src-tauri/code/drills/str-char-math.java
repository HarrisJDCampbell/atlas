public class Main {
    public static void main(String[] args) {
        char c = 'a';
        System.out.println(c + 1);
        System.out.println((char) (c + 1));
        System.out.println('a' + 'b');
        System.out.println("" + 'a' + 'b');
        System.out.println(1 + 2 + "3" + 4 + 5);
        c += 2;
        System.out.println(c);
    }
}
