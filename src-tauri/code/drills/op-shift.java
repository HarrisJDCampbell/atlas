public class Main {
    public static void main(String[] args) {
        int x = -16;
        System.out.println(x >> 2);
        System.out.println(x >>> 28);
        System.out.println(1 << 31);
        System.out.println(1 << 32);
        System.out.println(1L << 32);
        System.out.println(Integer.bitCount(-1));
    }
}
