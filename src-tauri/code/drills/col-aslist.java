import java.util.*;

public class Main {
    public static void main(String[] args) {
        String[] arr = {"a", "b", "c"};
        List<String> view = Arrays.asList(arr);
        view.set(0, "z");
        System.out.println(arr[0]);
        arr[1] = "y";
        System.out.println(view);
        try {
            view.add("d");
        } catch (Exception e) {
            System.out.println(e.getClass().getSimpleName());
        }
        int[] nums = {3, 1, 2};
        System.out.println(Arrays.asList(nums).size());
    }
}
