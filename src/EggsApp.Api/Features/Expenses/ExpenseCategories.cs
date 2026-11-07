using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

public static class ExpenseCategories
{
    /// <returns>The categories new expenses can use, in button order.</returns>
    public static async Task<List<CategoryRef>> ListActiveAsync(AppDbContext db) =>
        (await db.ExpenseCategories
            .AsNoTracking()
            .OrderBy(category => category.SortOrder)
            .ToListAsync())
        .Select(CategoryRef.From)
        .ToList();

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
    /// Checks the category of fields to save. A retired category is only allowed on an expense that already had it.
    /// </summary>
    /// <param name="keeping">The category the expense being edited has now; null for a new expense.</param>
    /// <returns>The category, or the field and Spanish message to answer with.</returns>
    public static async Task<(CategoryRef? Category, string? Field, string? Problem)> CheckAsync(
        AppDbContext db,
        ExpenseFields fields,
        Guid? keeping)
    {
        var found = await FindRefsAsync(db, [fields.CategoryId]);

        if (!found.TryGetValue(fields.CategoryId, out var category) || (category.IsRetired && category.Id != keeping))
        {
            return (null, "categoryId", "Esa categoría ya no existe. Escoja otra.");
        }

        if (category.NeedsDescription && fields.Note is null)
        {
            return (null, "note", ExpenseValidator.DescriptionMissingMessage);
        }

        return (category, null, null);
    }
}
