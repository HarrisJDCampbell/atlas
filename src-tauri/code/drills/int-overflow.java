public class Main {
    public static void main(String[] args) {
        int max = Integer.MAX_VALUE;
        System.out.println(max + 1);
        System.out.println(Math.abs(Integer.MIN_VALUE));
        System.out.println(-Integer.MIN_VALUE == Integer.MIN_VALUE);
        System.out.println((long) max + 1);
        try {
            System.out.println(Math.addExact(max, 1));
        } catch (ArithmeticException e) {
            System.out.println(e.getClass().getSimpleName());
        }
    }
}
