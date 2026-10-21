import java.util.*;

class Ref {
    public boolean canFinish(int numCourses, int[][] prerequisites) {
        // Kahn's algorithm: repeatedly take a course with no unmet prerequisites.
        List<List<Integer>> unlocks = new ArrayList<>(numCourses);
        for (int i = 0; i < numCourses; i++) unlocks.add(new ArrayList<>());
        int[] waitingOn = new int[numCourses];
        for (int[] p : prerequisites) {
            unlocks.get(p[1]).add(p[0]);
            waitingOn[p[0]]++;
        }
        int[] queue = new int[numCourses];
        int head = 0, tail = 0;
        for (int i = 0; i < numCourses; i++) if (waitingOn[i] == 0) queue[tail++] = i;
        while (head < tail) {
            int c = queue[head++];
            for (int next : unlocks.get(c)) if (--waitingOn[next] == 0) queue[tail++] = next;
        }
        return tail == numCourses; // anything never taken is stuck on a cycle
    }
}
