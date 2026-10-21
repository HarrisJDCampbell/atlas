public class Main {
    public static void main(String[] args) {
        String s = "hello";
        System.out.println(s.substring(1, 3));
        System.out.println(s.substring(5).isEmpty());
        s.toUpperCase();
        s.replace('l', 'L');
        System.out.println(s);
        System.out.println(s.indexOf('z'));
        try {
            System.out.println(s.substring(3, 1));
        } catch (Exception e) {
            System.out.println(e.getClass().getSimpleName());
        }
    }
}
