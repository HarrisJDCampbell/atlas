import java.util.*;

public class Main {
    public static void main(String[] args) {
        System.out.println("a,b,,c,,".split(",").length);
        System.out.println("a.b.c".split(".").length);
        System.out.println("a.b.c".split("\\.").length);
        System.out.println(Arrays.toString(" a  b ".split(" ")));
        System.out.println(Arrays.toString(" a  b ".trim().split("\\s+")));
    }
}
