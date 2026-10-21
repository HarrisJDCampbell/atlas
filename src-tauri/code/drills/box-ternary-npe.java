public class Main {
    public static void main(String[] args) {
        Integer cached = null;
        boolean hit = true;
        try {
            Integer v = hit ? cached : 0;
            System.out.println(v);
        } catch (Exception e) {
            System.out.println(e.getClass().getSimpleName());
        }
        Integer w = hit ? cached : Integer.valueOf(0);
        System.out.println(w);
    }
}
