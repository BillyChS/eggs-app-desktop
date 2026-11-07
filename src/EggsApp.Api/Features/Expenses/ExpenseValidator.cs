using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Expenses;

public static class ExpenseValidator
{
    public const string CategoryMissingMessage = "Escoja en qué gastó.";
    public const string DescriptionMissingMessage = "Escriba en qué gastó.";

    /// <returns>Spanish messages by field, ready to show next to each input. When there are none, the fields to save.</returns>
    public static (Dictionary<string, string[]> Errors, ExpenseFields? Fields) Validate(ExpenseCommand command)
    {
        var errors = new Dictionary<string, string[]>();
        var date = CalendarDays.Read(command.Date, "Escoja la fecha del gasto.", errors);
        var note = string.IsNullOrWhiteSpace(command.Note) ? null : command.Note.Trim();

        if (command.CategoryId is not { } categoryId || categoryId == Guid.Empty)
        {
            errors["categoryId"] = [CategoryMissingMessage];
            categoryId = Guid.Empty;
        }

        if (command.Amount is not { } amount || amount < 1)
        {
            errors["amount"] = ["Escriba el monto del gasto."];
            amount = 0;
        }

        if (note?.Length > Expense.NoteMaxLength)
        {
            errors["note"] = [$"La nota no puede tener más de {Expense.NoteMaxLength} letras."];
        }

        return (errors, errors.Count == 0 ? new ExpenseFields(date, categoryId, amount, note) : null);
    }
}
