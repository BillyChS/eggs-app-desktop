using System.Globalization;

namespace EggsApp.Api.Features.Common;

/// <summary>The days sales and abonos happen on: real, not before 2000, and not in the future.</summary>
public static class CalendarDays
{
    private static readonly DateOnly EarliestDate = new(2000, 1, 1);

    public static bool TryParse(string? text, out DateOnly date) =>
        DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    /// <summary>Reads a local YYYY-MM-DD, or adds a Spanish message under "date".</summary>
    /// <param name="missingMessage">What to ask for when there's no date, like "Escoja la fecha de la venta.".</param>
    public static DateOnly Read(string? text, string missingMessage, Dictionary<string, string[]> errors)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            errors["date"] = [missingMessage];
        }
        else if (!TryParse(text, out var date))
        {
            errors["date"] = ["Esa fecha no es válida."];
        }
        else if (date < EarliestDate)
        {
            errors["date"] = ["Revise el año de la fecha."];
        }
        else if (date > DateOnly.FromDateTime(DateTime.Now))
        {
            errors["date"] = ["La fecha no puede ser futura."];
        }
        else
        {
            return date;
        }

        return default;
    }

    /// <summary>The "from" and "to" of a list, both included, or Spanish messages under those names.</summary>
    public static Dictionary<string, string[]> ReadRange(string? from, string? to, out DateOnly first, out DateOnly last)
    {
        var errors = new Dictionary<string, string[]>();

        if (!TryParse(from, out first))
        {
            errors["from"] = ["Esa fecha no es válida."];
        }

        if (!TryParse(to, out last))
        {
            errors["to"] = ["Esa fecha no es válida."];
        }

        if (errors.Count == 0 && first > last)
        {
            errors["to"] = ["La fecha final no puede ser antes de la inicial."];
        }

        return errors;
    }
}
