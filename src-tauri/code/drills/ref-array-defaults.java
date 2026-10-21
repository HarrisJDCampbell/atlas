import java.util.*;

public class Main {
    public static void main(String[] args) {
        int[] a = new int[2];
        boolean[] f = new boolean[1];
        double[] d = new double[1];
        String[] s = new String[2];
        char[] c = new char[1];
        Integer[] boxed = new Integer[1];
        System.out.println(Arrays.toString(a) + " " + f[0] + " " + d[0]);
        System.out.println(Arrays.toString(s));
        System.out.println((int) c[0]);
        try {
            int x = boxed[0];
            System.out.println(x);
        } catch (Exception e) {
            System.out.println(e.getClass().getSimpleName());
        }
    }
}
