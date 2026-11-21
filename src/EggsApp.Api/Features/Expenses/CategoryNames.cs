using System.Globalization;
using EggsApp.Api.Features.Customers;

namespace EggsApp.Api.Features.Expenses;

/// <summary>
/// How a type of expense typed by hand ("Agregar tipo", or "Otro"'s "¿Qué gasto fue?") is cleaned and checked.
/// Names are compared with <see cref="CustomerNames.ForComparison"/>, so "GASOLÍNA" and "gasolina" are one type.
/// </summary>
public static class CategoryNames
{
    public const string MissingMessage = "Escriba el nombre del tipo.";
    public const string IsOtherMessage = "Escriba qué gasto fue, no «Otro».";
    public static readonly string TooLongMessage =
        $"El nombre no puede tener más de {ExpenseCategory.NameMaxLength} letras.";

    private static readonly CultureInfo Spanish = CultureInfo.GetCultureInfo("es-CR");

    /// <summary>No extra spaces, and a capital first letter, so "gasolina" shows like the seeded types.</summary>
    public static string Clean(string name)
    {
        var clean = CustomerNames.Clean(name);
        return clean.Length == 0 ? clean : char.ToUpper(clean[0], Spanish) + clean[1..];
    }

    /// <returns>What's wrong with a cleaned name that can be told without the database, or null.</returns>
    public static string? Problem(string clean) =>
        clean.Length == 0 ? MissingMessage
        : clean.Length > ExpenseCategory.NameMaxLength ? TooLongMessage
        : null;
}
