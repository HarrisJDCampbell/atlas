public class Main {
    static int calls = 0;

    static boolean check(boolean v) { calls++; return v; }

    public static void main(String[] args) {
        int[] arr = {};
        System.out.println(arr.length > 0 && arr[0] == 1);
        boolean r = check(false) && check(true);
        System.out.println(r + " " + calls);
        calls = 0;
        r = check(false) & check(true);
        System.out.println(r + " " + calls);
        calls = 0;
        r = check(true) || check(false);
        System.out.println(r + " " + calls);
        try {
            System.out.println(arr.length > 0 & arr[0] == 1);
        } catch (Exception e) {
            System.out.println(e.getClass().getSimpleName());
        }
    }
}
