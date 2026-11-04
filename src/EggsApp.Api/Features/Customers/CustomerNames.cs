using System.Globalization;
using System.Text;

namespace EggsApp.Api.Features.Customers;

/// <summary>
/// How names are cleaned, compared and sorted. All of it runs in C#, not SQL: SQLite's LIKE only ignores case for
/// ASCII, so "MARÍA" wouldn't find "María", and its sort puts "Ángela" after "Zoila".
/// </summary>
public static class CustomerNames
{
    /// <summary>Spanish alphabetical order, ignoring case.</summary>
    public static readonly StringComparer SpanishOrder =
        StringComparer.Create(CultureInfo.GetCultureInfo("es-CR"), CompareOptions.IgnoreCase);

    /// <summary>The name as stored: no extra spaces, and one encoding for each accented letter.</summary>
    public static string Clean(string name) =>
        string.Join(' ', name.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).Normalize();

    /// <summary>The name without accents, case or extra spaces. "ñ" counts as "n": it's easy to skip when typing.</summary>
    public static string ForComparison(string name)
    {
        var builder = new StringBuilder(name.Length);

        foreach (var character in Clean(name).Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(char.ToLowerInvariant(character));
            }
        }

        return builder.ToString();
    }

    /// <summary>True if every word of the search appears in the name, in any order and even partly.</summary>
    public static bool MatchesSearch(string name, string search)
    {
        var comparableName = ForComparison(name);

        return Words(ForComparison(search)).All(word => comparableName.Contains(word, StringComparison.Ordinal));
    }

    /// <summary>
    /// Whether two names may belong to the same person: the same name, all the words of one in the other, or a small
    /// typo. It's only used to ask, so it's better to ask once too often than to split someone into two accounts.
    /// </summary>
    public static bool AreSimilar(string first, string second)
    {
        var a = ForComparison(first);
        var b = ForComparison(second);

        if (a.Length == 0 || b.Length == 0)
        {
            return false;
        }

        var wordsA = Words(a);
        var wordsB = Words(b);

        if (wordsA.IsSubsetOf(wordsB) || wordsB.IsSubsetOf(wordsA))
        {
            return true;
        }

        var allowedTypos = Math.Max(a.Length, b.Length) switch
        {
            < 4 => 0,
            < 8 => 1,
            _ => 2,
        };

        return EditDistance(a, b) <= allowedTypos;
    }

    private static HashSet<string> Words(string comparable) => [.. comparable.Split(' ', StringSplitOptions.RemoveEmptyEntries)];

    // Levenshtein: how many letters must be added, removed or changed to turn one text into the other.
    private static int EditDistance(string a, string b)
    {
        var previous = new int[b.Length + 1];
        var current = new int[b.Length + 1];

        for (var j = 0; j <= b.Length; j++)
        {
            previous[j] = j;
        }

        for (var i = 1; i <= a.Length; i++)
        {
            current[0] = i;

            for (var j = 1; j <= b.Length; j++)
            {
                var change = previous[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1);
                current[j] = Math.Min(change, Math.Min(previous[j], current[j - 1]) + 1);
            }

            (previous, current) = (current, previous);
        }

        return previous[b.Length];
    }
}
