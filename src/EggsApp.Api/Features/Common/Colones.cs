using System.Globalization;

namespace EggsApp.Api.Features.Common;

public static class Colones
{
    /// <summary>8000 → "₡8.000", as the UI writes money. By hand, because no culture gives exactly this.</summary>
    public static string Format(long amount)
    {
        var digits = Math.Abs(amount).ToString(CultureInfo.InvariantCulture);
        var grouped = string.Join('.', Enumerable
            .Range(0, (digits.Length + 2) / 3)
            .Select(group => digits[Math.Max(0, digits.Length - (3 * (group + 1)))..(digits.Length - (3 * group))])
            .Reverse());

        return $"{(amount < 0 ? "-" : string.Empty)}₡{grouped}";
    }
}
