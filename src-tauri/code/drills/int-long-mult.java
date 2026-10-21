public class Main {
    public static void main(String[] args) {
        int n = 100_000;
        long bad = n * n;
        long good = (long) n * n;
        System.out.println(bad);
        System.out.println(good);
        int lo = 2_000_000_000, hi = 2_100_000_000;
        System.out.println((lo + hi) / 2);
        System.out.println(lo + (hi - lo) / 2);
        System.out.println((lo + hi) >>> 1);
    }
}
