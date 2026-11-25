using System;
using System.Security.Cryptography;
using System.Collections.Generic;

public static class CleanSaveKeyGen {
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const string Salt = "CLEANSAVE-IMAGE-PRO-V1::OFFLINE-VERIFY";

    private static uint FnvMix(string input) {
        unchecked {
            uint h1 = 0x811c9dc5u;
            uint h2 = 0x9e3779b9u;
            for (int i = 0; i < input.Length; i++) {
                uint ch = (uint)input[i];
                h1 ^= ch;
                h1 *= 0x01000193u;
                h2 ^= (ch + (uint)((i + 1) * 31));
                h2 = (h2 ^ (h2 >> 13)) * 0x85ebca6bu;
            }
            return h1 ^ (h2 >> 5) ^ (h2 << 7);
        }
    }

    public static string ComputeCheckCode(string payload8) {
        string norm = payload8.ToUpperInvariant();
        uint hashA = FnvMix(Salt + ":" + norm);
        uint hashB = FnvMix(norm + "::" + Salt);
        return new string(new[] {
            Alphabet[(int)(hashA & 31u)],
            Alphabet[(int)((hashA >> 5) & 31u)],
            Alphabet[(int)((hashB >> 2) & 31u)],
            Alphabet[(int)((hashB >> 7) & 31u)]
        });
    }

    public static string GenerateFromPayload(string payload8) {
        string norm = payload8.ToUpperInvariant();
        string check = ComputeCheckCode(norm);
        return "CSPRO-" + norm.Substring(0, 4) + "-" + norm.Substring(4, 4) + "-" + check;
    }

    public static string[] GenerateBatch(int count) {
        var seen = new HashSet<string>();
        var list = new List<string>(count);
        byte[] buf = new byte[8];
        using (var rng = RandomNumberGenerator.Create()) {
            while (list.Count < count) {
                rng.GetBytes(buf);
                char[] chars = new char[8];
                for (int i = 0; i < 8; i++) chars[i] = Alphabet[buf[i] & 31];
                string payload = new string(chars);
                if (seen.Add(payload)) {
                    list.Add(GenerateFromPayload(payload));
                }
            }
        }
        return list.ToArray();
    }
}