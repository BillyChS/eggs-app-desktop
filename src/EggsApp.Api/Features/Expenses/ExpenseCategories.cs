using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

/// <summary>What <see cref="ExpenseCategories.ResolveAsync"/> did with the name it was given.</summary>
public enum ResolvedCategory
{
    /// <summary>An active type already had that name.</summary>
    Existing,

    /// <summary>A retired type had it: it's offered again.</summary>
    Reactivated,

    /// <summary>No type had it: one was added.</summary>
    Created,
}

public static class ExpenseCategories
{
    /// <returns>
    /// The categories, with how many expenses use each, in Spanish alphabetical order and "Otro" last: the order of
    /// the form's list and of "Tipos de gasto".
    /// </returns>
    /// <param name="includeRetired">Also the retired ones, marked as such.</param>
    public static async Task<List<CategorySummary>> ListAsync(AppDbContext db, bool includeRetired)
    {
        var query = db.ExpenseCategories.AsNoTracking();

        if (includeRetired)
        {
            query = query.IgnoreQueryFilters([AppDbContext.SoftDeleteFilter]);
        }

        var categories = await query.ToListAsync();
        var counts = await db.Expenses
            .GroupBy(expense => expense.CategoryId)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(group => group.Key, group => group.Count);

        return categories
            .OrderBy(category => category.NeedsDescription)
            .ThenBy(category => category.Name, CustomerNames.SpanishOrder)
            .Select(category => new CategorySummary(
                category.Id,
                category.Name,
                category.NeedsDescription,
                category.IsDeleted,
                counts.GetValueOrDefault(category.Id)))
            .ToList();
    }

    /// <summary>Names for expenses, including categories that were retired since.</summary>
    public static async Task<Dictionary<Guid, CategoryRef>> FindRefsAsync(AppDbContext db, IEnumerable<Guid> ids)
    {
        var wanted = ids.Distinct().ToList();

        if (wanted.Count == 0)
        {
            return [];
        }

        return (await db.ExpenseCategories
                .IgnoreQueryFilters([AppDbContext.SoftDeleteFilter])
                .AsNoTracking()
                .Where(category => wanted.Contains(category.Id))
                .ToListAsync())
            .ToDictionary(category => category.Id, CategoryRef.From);
    }

    /// <summary>
    /// The type with this name, compared without case or accents, retired ones included: reactivated if retired,
    /// added if there's none. Nothing is saved: the caller's SaveChanges does it, with whatever it saves too.
    /// </summary>
    /// <param name="name">Already cleaned with <see cref="CategoryNames.Clean"/>.</param>
    /// <returns>The type and what was done, or the Spanish message to answer with.</returns>
    public static async Task<(ExpenseCategory? Category, ResolvedCategory Resolved, string? Problem)> ResolveAsync(
        AppDbContext db,
        string name)
    {
        if (CategoryNames.Problem(name) is { } problem)
        {
            return (null, default, problem);
        }

        var key = CustomerNames.ForComparison(name);

        // In C#: SQLite can't compare without accents. There are only a few dozen types.
        var same = (await db.ExpenseCategories.IgnoreQueryFilters([AppDbContext.SoftDeleteFilter]).ToListAsync())
            .Where(category => CustomerNames.ForComparison(category.Name) == key)
            .OrderBy(category => category.IsDeleted)
            .ThenByDescending(category => category.UpdatedAt)
            .FirstOrDefault();

        if (same?.NeedsDescription == true)
        {
            return (null, default, CategoryNames.IsOtherMessage);
        }

        if (same is null)
        {
            var added = new ExpenseCategory { Name = name };
            db.ExpenseCategories.Add(added);
            return (added, ResolvedCategory.Created, null);
        }

        if (same.IsDeleted)
        {
            same.IsDeleted = false;
            return (same, ResolvedCategory.Reactivated, null);
        }

        return (same, ResolvedCategory.Existing, null);
    }

    /// <summary>
    /// The category of fields to save: the one they name, or the one <see cref="ExpenseFields.NewCategory"/> resolves
    /// to. A retired category is only allowed on an expense that already had it; "Otro" itself is never saved again,
    /// since what it was becomes a type of its own.
    /// </summary>
    /// <param name="keeping">The category the expense being edited has now; null for a new expense.</param>
    /// <returns>The category, or the field and Spanish message to answer with.</returns>
    public static async Task<(CategoryRef? Category, string? Field, string? Problem)> CheckAsync(
        AppDbContext db,
        ExpenseFields fields,
        Guid? keeping)
    {
        if (fields.NewCategory is { } name)
        {
            var (resolved, _, problem) = await ResolveAsync(db, name);
            return resolved is null ? (null, "newCategory", problem) : (CategoryRef.From(resolved), null, null);
        }

        var found = await FindRefsAsync(db, [fields.CategoryId]);

        if (!found.TryGetValue(fields.CategoryId, out var category) || (category.IsRetired && category.Id != keeping))
        {
            return (null, "categoryId", "Esa categoría ya no existe. Escoja otra.");
        }

        if (category.NeedsDescription)
        {
            return (null, "newCategory", ExpenseValidator.DescriptionMissingMessage);
        }

        return (category, null, null);
    }
}
