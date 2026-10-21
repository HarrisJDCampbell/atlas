import java.util.*;

public class Main {
    public static void main(String[] args) {
        int i = 5;
        i = i++;
        System.out.println(i);
        int j = 5;
        int k = j++ + ++j;
        System.out.println(k + " " + j);
        int[] a = {10, 20, 30};
        int idx = 0;
        a[idx++] = a[idx] + 1;
        System.out.println(Arrays.toString(a) + " " + idx);
    }
}
