import java.io.*;
import java.util.*;
import java.util.concurrent.Callable;

// Judges Solution against Ref and prints one JSON object per line:
//   case   - each fixed test (examples + edge cases)
//   stress - small random inputs until the first mismatch (full mode only)
//   bench  - wall time at doubling n, yours vs the reference (full mode only)
//   done
// Usage: java Runner <test|full> <benchMin> <benchMax> <caseTimeoutMs>
public class Runner {
    static final PrintStream REAL = System.out;
    static final long STACK = 1L << 29; // 512 MB: deep recursion is legal in interviews

    public static void main(String[] args) {
        boolean full = args.length > 0 && args[0].equals("full");
        int benchMin = args.length > 1 ? Integer.parseInt(args[1]) : 0;
        int benchMax = args.length > 2 ? Integer.parseInt(args[2]) : 0;
        long timeout = args.length > 3 ? Long.parseLong(args[3]) : 4000;

        boolean allOk = true;
        List<Object[]> fixed = Cases.fixed();
        for (int i = 0; i < fixed.size(); i++) {
            Object[] in = fixed.get(i);
            Outcome want = call(false, in, timeout * 4);
            if (want.error != null) { emit("{\"t\":\"broken\",\"i\":" + i + ",\"msg\":" + q("reference failed: " + want.error) + "}"); end(); }
            Outcome got = call(true, in, timeout);
            boolean ok = got.error == null && !got.timedOut && Cases.accept(Judge.copyAll(in), want.value, got.value);
            allOk &= ok;
            emit(caseJson("case", i, ok, in, want, got));
            if (got.timedOut) end();
        }
        if (!full || !allOk) end();

        // Stress: many small random inputs, smallest first, so a counterexample is short.
        int[] sizes = {0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20, 30};
        int count = 0;
        Random r = new Random(20261020L);
        stress:
        for (int size : sizes) {
            for (int rep = 0; rep < 30; rep++) {
                Object[] in = Cases.random(r, size);
                if (in == null) break stress;
                Outcome want = call(false, in, timeout * 4);
                if (want.error != null) continue; // generator produced something the reference rejects
                Outcome got = call(true, in, timeout);
                count++;
                boolean ok = got.error == null && !got.timedOut && Cases.accept(Judge.copyAll(in), want.value, got.value);
                if (!ok) {
                    emit(caseJson("stress", count, false, in, want, got));
                    end();
                }
            }
        }
        emit("{\"t\":\"stress\",\"ok\":true,\"count\":" + count + "}");

        if (benchMax <= 0) end();
        // Warm the JIT on a mid-size input so the first timings aren't interpreter speed.
        Object[] warm = Cases.bench(new Random(1), benchMin);
        if (warm == null) end();
        for (int k = 0; k < 6; k++) { call(true, warm, timeout); call(false, warm, timeout); }

        long budget = System.nanoTime() + 9_000_000_000L;
        for (int n = benchMin; n <= benchMax && System.nanoTime() < budget; n *= 2) {
            Object[] in = Cases.bench(new Random(n), n);
            long mine = Long.MAX_VALUE, ref = Long.MAX_VALUE;
            for (int k = 0; k < 3; k++) {
                System.gc(); // collect the last run's garbage outside the timed window
                Outcome o = call(true, in, Math.max(timeout, 3000));
                if (o.timedOut || o.error != null) { emit("{\"t\":\"bench\",\"n\":" + n + ",\"ns\":-1,\"refNs\":-1}"); end(); }
                mine = Math.min(mine, o.nanos);
                System.gc();
                Outcome w = call(false, in, Math.max(timeout, 3000));
                ref = Math.min(ref, w.nanos);
                if (mine > 600_000_000L) break; // one slow run is enough evidence
            }
            emit("{\"t\":\"bench\",\"n\":" + n + ",\"ns\":" + mine + ",\"refNs\":" + ref + "}");
            if (mine > 600_000_000L) break;
        }
        end();
    }

    static final class Outcome {
        Object value;
        String error, at, stdout = "";
        boolean timedOut;
        long nanos;
    }

    /** Calls the user's code (mine) or the reference on a fresh copy of the input. The copy is made before the clock starts. */
    static Outcome call(boolean mine, Object[] in, long timeoutMs) {
        Object[] args = Judge.copyAll(in);
        return call(() -> mine ? Cases.run(args) : Cases.ref(args), timeoutMs);
    }

    /** Runs on its own thread with a big stack; a timeout leaves it behind as a daemon. */
    static Outcome call(Callable<Object> c, long timeoutMs) {
        Outcome o = new Outcome();
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        PrintStream cap = new PrintStream(new LimitedStream(buf, 4000), true);
        Thread t = new Thread(null, () -> {
            System.setOut(cap);
            long t0 = System.nanoTime();
            try { o.value = c.call(); }
            catch (StackOverflowError e) { o.error = "StackOverflowError — recursion too deep or never reaches its base case"; o.at = frame(e); }
            catch (OutOfMemoryError e) { o.error = "OutOfMemoryError — the solution allocates too much"; }
            catch (Throwable e) { o.error = e.toString(); o.at = frame(e); }
            finally { o.nanos = System.nanoTime() - t0; System.setOut(REAL); }
        }, "solution", STACK);
        t.setDaemon(true);
        t.start();
        try { t.join(timeoutMs); } catch (InterruptedException ignored) {}
        if (t.isAlive()) { o.timedOut = true; o.error = "timed out after " + timeoutMs + " ms"; }
        o.stdout = buf.toString();
        return o;
    }

    /** The first stack frame inside the user's own code. */
    static String frame(Throwable e) {
        for (StackTraceElement s : e.getStackTrace()) {
            String f = s.getFileName();
            if (f != null && !f.equals("Runner.java") && !f.equals("Judge.java") && !f.equals("Cases.java") && !f.equals("Ref.java") && !f.equals("Support.java") && !s.getClassName().startsWith("java."))
                return f + ":" + s.getLineNumber();
        }
        return null;
    }

    static String caseJson(String t, int i, boolean ok, Object[] in, Outcome want, Outcome got) {
        StringBuilder sb = new StringBuilder("{\"t\":\"").append(t).append("\",\"i\":").append(i).append(",\"ok\":").append(ok);
        sb.append(",\"ms\":").append(String.format(Locale.ROOT, "%.3f", got.nanos / 1e6));
        sb.append(",\"in\":[");
        for (int k = 0; k < in.length; k++) { if (k > 0) sb.append(','); sb.append(q(Judge.show(in[k]))); }
        sb.append("],\"want\":").append(q(Judge.show(want.value)));
        sb.append(",\"got\":").append(got.error == null && !got.timedOut ? q(Judge.show(got.value)) : "null");
        if (got.error != null) sb.append(",\"error\":").append(q(got.error));
        if (got.at != null) sb.append(",\"at\":").append(q(got.at));
        if (!got.stdout.isEmpty()) sb.append(",\"stdout\":").append(q(got.stdout));
        return sb.append('}').toString();
    }

    static void emit(String line) { REAL.println(line); REAL.flush(); }

    static void end() {
        emit("{\"t\":\"done\"}");
        Runtime.getRuntime().halt(0); // stuck daemon threads must not keep the JVM alive
    }

    static String q(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> { if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch)); else sb.append(ch); }
            }
        }
        return sb.append('"').toString();
    }

    /** Keeps a print-in-a-loop from flooding memory; the first few KB are what you'd read anyway. */
    static final class LimitedStream extends OutputStream {
        final OutputStream out; final int max; int n;
        LimitedStream(OutputStream out, int max) { this.out = out; this.max = max; }
        @Override public void write(int b) throws IOException { if (n++ < max) out.write(b); }
    }
}
