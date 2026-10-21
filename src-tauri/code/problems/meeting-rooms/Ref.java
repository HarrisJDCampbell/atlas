import java.util.*;

class Ref {
    public int minMeetingRooms(int[][] intervals) {
        int n = intervals.length;
        int[] starts = new int[n], ends = new int[n];
        for (int i = 0; i < n; i++) { starts[i] = intervals[i][0]; ends[i] = intervals[i][1]; }
        Arrays.sort(starts);
        Arrays.sort(ends);
        // Sweep the starts in order; ends[j] is the earliest meeting still holding a room.
        int rooms = 0, j = 0;
        for (int i = 0; i < n; i++) {
            if (starts[i] < ends[j]) rooms++; // nobody has left yet: open a new room
            else j++;                          // reuse the room freed at ends[j] (half-open, so == is free)
        }
        return rooms;
    }
}
