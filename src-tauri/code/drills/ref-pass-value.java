import java.util.*;

public class Main {
    static void reassign(int[] a) { a = new int[]{9, 9}; }
    static void mutate(int[] a) { a[0] = 9; }
    static void bump(int x) { x++; }
    static void grow(StringBuilder sb) {
        sb.append("!");
        sb = new StringBuilder("new");
    }

    public static void main(String[] args) {
        int[] arr = {1, 2};
        reassign(arr);
        System.out.println(Arrays.toString(arr));
        mutate(arr);
        System.out.println(Arrays.toString(arr));
        int n = 1;
        bump(n);
        System.out.println(n);
        StringBuilder sb = new StringBuilder("hi");
        grow(sb);
        System.out.println(sb);
    }
}
