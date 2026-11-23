using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

/// <summary>"Agregar tipo" in "Tipos de gasto": the same rules as a type that comes from "Otro".</summary>
public static class CreateCategory
{
    public static async Task<Outcome<(CategorySummary Category, ResolvedCategory Resolved)>> HandleAsync(
        AppDbContext db,
        CategoryCommand command)
    {
        var (category, resolved, problem) = await ExpenseCategories.ResolveAsync(db, CategoryNames.Clean(command.Name ?? ""));

        if (category is null)
        {
            return Outcome<(CategorySummary, ResolvedCategory)>.Invalid("name", problem!);
        }

        await db.SaveChangesAsync();

        var count = await db.Expenses.CountAsync(expense => expense.CategoryId == category.Id);
        var summary = new CategorySummary(category.Id, category.Name, category.NeedsDescription, false, count);

        return Outcome<(CategorySummary, ResolvedCategory)>.Done((summary, resolved));
    }
}
