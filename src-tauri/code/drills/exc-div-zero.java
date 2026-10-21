public class Main {
    public static void main(String[] args) {
        try {
            System.out.println(1 / 0);
        } catch (ArithmeticException e) {
            System.out.println(e.getClass().getSimpleName());
        }
        System.out.println(1.0 / 0);
        double nan = 0.0 / 0;
        System.out.println(nan == nan);
        System.out.println(0.1 + 0.2 == 0.3);
        System.out.println(Math.abs(0.1 + 0.2 - 0.3) < 1e-9);
    }
}
