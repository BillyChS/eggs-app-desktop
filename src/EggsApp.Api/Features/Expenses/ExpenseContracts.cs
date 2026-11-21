namespace EggsApp.Api.Features.Expenses;

/// <summary>What the UI sends.</summary>
/// <param name="NewCategory">
/// What "Otro"'s "¿Qué gasto fue?" says, in place of <paramref name="CategoryId"/>: the type the expense goes under,
/// reused if one has that name, reactivated if it was retired, otherwise added.
/// </param>
public sealed record ExpenseCommand(
    string? Date,
    Guid? CategoryId,
    long? Amount,
    string? Note,
    string? NewCategory = null);

/// <summary>
/// A command that passed validation. Whether the category exists, is still in use and needs a description is the
/// handler's to check.
/// </summary>
/// <param name="CategoryId">Empty when <paramref name="NewCategory"/> is given.</param>
/// <param name="NewCategory">The cleaned name of the type to reuse or add, or null.</param>
public sealed record ExpenseFields(DateOnly Date, Guid CategoryId, string? NewCategory, long Amount, string? Note);

/// <summary>"Agregar tipo".</summary>
public sealed record CategoryCommand(string? Name);

/// <summary>A category as "Tipos de gasto" and the form's list show it.</summary>
/// <param name="ExpenseCount">How many expenses use it, of any date.</param>
public sealed record CategorySummary(Guid Id, string Name, bool NeedsDescription, bool IsRetired, int ExpenseCount);

/// <summary>A category as the form's buttons and an expense's row show it.</summary>
/// <param name="IsRetired">No longer offered for new expenses; its old expenses still show it.</param>
public sealed record CategoryRef(Guid Id, string Name, bool NeedsDescription, bool IsRetired)
{
    public static CategoryRef From(ExpenseCategory category) =>
        new(category.Id, category.Name, category.NeedsDescription, category.IsDeleted);
}

/// <param name="Category">What it was for, even if that category was retired since.</param>
public sealed record ExpenseDetail(Guid Id, DateOnly Date, CategoryRef Category, long Amount, string? Note)
{
    public static ExpenseDetail From(Expense expense, IReadOnlyDictionary<Guid, CategoryRef> categories) =>
        From(expense, categories[expense.CategoryId]);

    public static ExpenseDetail From(Expense expense, CategoryRef category) =>
        new(expense.Id, expense.ExpenseDate, category, expense.Amount, expense.Note);
}

/// <summary>What went to one category in a period.</summary>
/// <param name="Count">How many expenses.</param>
public sealed record CategoryTotal(Guid Id, string Name, long Total, int Count);

/// <param name="Total">The expenses added up: what went out in the period, on the days it was spent.</param>
/// <param name="ByCategory">
/// The same expenses by category, largest first, then by name. Resúmenes shows these, so the two can't disagree.
/// </param>
public sealed record ExpenseListResponse(
    IReadOnlyList<ExpenseDetail> Expenses,
    long Total,
    IReadOnlyList<CategoryTotal> ByCategory);
