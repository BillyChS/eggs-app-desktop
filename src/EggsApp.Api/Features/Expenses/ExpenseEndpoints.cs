using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Expenses;

public static class ExpenseEndpoints
{
    public static RouteGroupBuilder MapExpenses(this RouteGroupBuilder api)
    {
        api.MapGet("/expense-categories", async (AppDbContext db) =>
                Results.Ok(await ExpenseCategories.ListActiveAsync(db)))
            .WithName("ListExpenseCategories");

        var expenses = api.MapGroup("/expenses");

        expenses.MapPost("/", async (AppDbContext db, ExpenseCommand command) =>
            {
                var (errors, fields) = ExpenseValidator.Validate(command);

                if (fields is null)
                {
                    return Results.ValidationProblem(errors);
                }

                var outcome = await CreateExpense.HandleAsync(db, fields);
                return outcome.ToResult(expense => Results.Created($"/api/expenses/{expense.Id}", expense));
            })
            .WithName("CreateExpense");

        expenses.MapGet("/", async (AppDbContext db, string? from, string? to) =>
            {
                var errors = CalendarDays.ReadRange(from, to, out var first, out var last);

                return errors.Count > 0
                    ? Results.ValidationProblem(errors)
                    : Results.Ok(await ListExpenses.HandleAsync(db, first, last));
            })
            .WithName("ListExpenses");

        expenses.MapGet("/{id:guid}", async (AppDbContext db, Guid id) =>
                await GetExpense.HandleAsync(db, id) is { } expense
                    ? Results.Ok(expense)
                    : Results.NotFound())
            .WithName("GetExpense");

        expenses.MapPut("/{id:guid}", async (AppDbContext db, Guid id, ExpenseCommand command) =>
            {
                var (errors, fields) = ExpenseValidator.Validate(command);

                if (fields is null)
                {
                    return Results.ValidationProblem(errors);
                }

                var outcome = await UpdateExpense.HandleAsync(db, id, fields);
                return outcome.ToResult(expense => Results.Ok(expense));
            })
            .WithName("UpdateExpense");

        expenses.MapDelete("/{id:guid}", async (AppDbContext db, Guid id) =>
                (await DeleteExpense.HandleAsync(db, id)).ToResult(_ => Results.NoContent()))
            .WithName("DeleteExpense");

        return api;
    }
}
