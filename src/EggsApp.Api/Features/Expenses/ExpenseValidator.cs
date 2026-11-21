using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Expenses;

public static class ExpenseValidator
{
    public const string CategoryMissingMessage = "Elija el tipo de gasto.";
    /// <summary>For "Otro", which needs "¿Qué gasto fue?": the type the expense goes under.</summary>
    public const string DescriptionMissingMessage = "Escriba qué gasto fue.";
    public const string AmountMissingMessage = "Escriba el monto.";

    /// <returns>Spanish messages by field, ready to show next to each input. When there are none, the fields to save.</returns>
    public static (Dictionary<string, string[]> Errors, ExpenseFields? Fields) Validate(ExpenseCommand command)
    {
        var errors = new Dictionary<string, string[]>();
        var date = CalendarDays.Read(command.Date, "Escoja la fecha del gasto.", errors);
        var note = string.IsNullOrWhiteSpace(command.Note) ? null : command.Note.Trim();
        var newCategory = string.IsNullOrWhiteSpace(command.NewCategory) ? null : CategoryNames.Clean(command.NewCategory);
        var categoryId = Guid.Empty;

        if (newCategory is not null)
        {
            if (CategoryNames.Problem(newCategory) is { } problem)
            {
                errors["newCategory"] = [problem];
            }
        }
        else if (command.CategoryId is not { } chosen || chosen == Guid.Empty)
        {
            errors["categoryId"] = [CategoryMissingMessage];
        }
        else
        {
            categoryId = chosen;
        }

        if (command.Amount is not { } amount || amount < 1)
        {
            errors["amount"] = [AmountMissingMessage];
            amount = 0;
        }

        if (note?.Length > Expense.NoteMaxLength)
        {
            errors["note"] = [$"La nota no puede tener más de {Expense.NoteMaxLength} letras."];
        }

        return (errors, errors.Count == 0 ? new ExpenseFields(date, categoryId, newCategory, amount, note) : null);
    }
}
