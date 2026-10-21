import java.util.*;

class Ref {
    public int coinChange(int[] coins, int amount) {
        // dp[a] = fewest coins that make a; amount + 1 stands in for "impossible"
        // (no answer can use more than `amount` coins, since every coin is ≥ 1).
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, amount + 1);
        dp[0] = 0;
        for (int a = 1; a <= amount; a++)
            for (int c : coins)
                if (c <= a && dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
        return dp[amount] > amount ? -1 : dp[amount];
    }
}
