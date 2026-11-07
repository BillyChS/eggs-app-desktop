using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Data;
using EggsApp.Api.Features.Expenses;
using EggsApp.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace EggsApp.Tests.Features.Expenses;

/// <summary>Expenses and their categories. A new factory per test, so every total is known.</summary>
public sealed class ExpenseEndpointsTests : IDisposable
{
    private const string Nov3 = "2024-11-03";
    private const string Nov4 = "2024-11-04";
    private const string Nov5 = "2024-11-05";

    private static readonly Guid Alimento = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0001");
    private static readonly Guid Cartones = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0005");
    private static readonly Guid Otro = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0008");

    private readonly EggsAppFactory _factory = new();
    private readonly HttpClient _client;

    public ExpenseEndpointsTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private Task<HttpResponseMessage> PostAsync(string? date, Guid? categoryId, long? amount, string? note = null) =>
        _client.PostAsJsonAsync("/api/expenses", new ExpenseCommand(date, categoryId, amount, note));

    private async Task<ExpenseDetail> CreateAsync(string date, Guid categoryId, long amount, string? note = null)
    {
        var response = await PostAsync(date, categoryId, amount, note);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ExpenseDetail>())!;
    }

    private async Task<ExpenseListResponse> ListAsync(string from, string to) =>
        (await _client.GetFromJsonAsync<ExpenseListResponse>($"/api/expenses?from={from}&to={to}"))!;

    private static async Task<IDictionary<string, string[]>> ReadErrorsAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors;
    }

    private async Task RetireAsync(Guid categoryId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.ExpenseCategories.Remove(await db.ExpenseCategories.SingleAsync(category => category.Id == categoryId));
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Categories_AreTheSeededOnes_InButtonOrder_OnlyOtroNeedsADescription()
    {
        var categories = await _client.GetFromJsonAsync<List<CategoryRef>>("/api/expense-categories");

        Assert.Equal(
            ["Alimento", "Vitaminas", "Desparasitantes", "Burucha", "Cartones", "Plásticos/Envoltorios", "Equipo", "Otro"],
            categories!.Select(category => category.Name));
        Assert.Equal([Otro], categories!.Where(category => category.NeedsDescription).Select(category => category.Id));
        Assert.All(categories!, category => Assert.False(category.IsRetired));
    }

    [Fact]
    public async Task Create_ReturnsTheExpenseWithItsCategory_AndTrimsTheNote()
    {
        var expense = await CreateAsync(Nov3, Alimento, 31000, "  2 sacos  ");

        Assert.Equal(new DateOnly(2024, 11, 3), expense.Date);
        Assert.Equal(new CategoryRef(Alimento, "Alimento", false, false), expense.Category);
        Assert.Equal(31000, expense.Amount);
        Assert.Equal("2 sacos", expense.Note);

        var read = await _client.GetFromJsonAsync<ExpenseDetail>($"/api/expenses/{expense.Id}");
        Assert.Equal(expense, read);
    }

    [Fact]
    public async Task Create_WithNothing_AsksForEveryField()
    {
        var errors = await ReadErrorsAsync(await PostAsync(null, null, null));

        Assert.Equal(["Escoja la fecha del gasto."], errors["date"]);
        Assert.Equal(["Escoja en qué gastó."], errors["categoryId"]);
        Assert.Equal(["Escriba el monto del gasto."], errors["amount"]);
    }

    [Theory]
    [InlineData(0L)]
    [InlineData(-5L)]
    public async Task Create_WithAnAmountBelowOne_IsRefused(long amount)
    {
        var errors = await ReadErrorsAsync(await PostAsync(Nov3, Alimento, amount));

        Assert.Equal(["Escriba el monto del gasto."], errors["amount"]);
    }

    [Theory]
    [InlineData("2024-13-01", "Esa fecha no es válida.")]
    [InlineData("1999-12-31", "Revise el año de la fecha.")]
    public async Task Create_WithABadDate_IsRefused(string date, string message)
    {
        var errors = await ReadErrorsAsync(await PostAsync(date, Alimento, 1000));

        Assert.Equal([message], errors["date"]);
    }

    [Fact]
    public async Task Create_InTheFuture_IsRefused()
    {
        var tomorrow = DateOnly.FromDateTime(DateTime.Now).AddDays(1).ToString("yyyy-MM-dd");

        var errors = await ReadErrorsAsync(await PostAsync(tomorrow, Alimento, 1000));

        Assert.Equal(["La fecha no puede ser futura."], errors["date"]);
    }

    [Fact]
    public async Task Create_WithANoteTooLong_IsRefused()
    {
        var errors = await ReadErrorsAsync(await PostAsync(Nov3, Alimento, 1000, new string('x', 201)));

        Assert.Equal(["La nota no puede tener más de 200 letras."], errors["note"]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Otro_WithoutADescription_IsRefused(string? note)
    {
        var errors = await ReadErrorsAsync(await PostAsync(Nov3, Otro, 5000, note));

        Assert.Equal(["Escriba en qué gastó."], errors["note"]);
    }

    [Fact]
    public async Task Otro_WithADescription_IsSaved_AndOtherCategoriesNeedNone()
    {
        var other = await CreateAsync(Nov3, Otro, 5000, "Gasolina");
        var plain = await CreateAsync(Nov3, Cartones, 2500);

        Assert.Equal("Gasolina", other.Note);
        Assert.Null(plain.Note);
    }

    [Fact]
    public async Task Create_WithACategoryThatDoesNotExist_IsRefused()
    {
        var errors = await ReadErrorsAsync(await PostAsync(Nov3, Guid.NewGuid(), 1000));

        Assert.Equal(["Esa categoría ya no existe. Escoja otra."], errors["categoryId"]);
    }

    [Fact]
    public async Task List_FiltersByDate_BothEndsIncluded_NewestFirst_WithThePeriodTotal()
    {
        await CreateAsync("2024-11-02", Alimento, 100000);
        var first = await CreateAsync(Nov3, Alimento, 31000);
        var second = await CreateAsync(Nov3, Cartones, 2500);
        var later = await CreateAsync(Nov4, Otro, 5000, "Gasolina");
        await CreateAsync(Nov5, Alimento, 70000);

        var list = await ListAsync(Nov3, Nov4);

        Assert.Equal([later.Id, second.Id, first.Id], list.Expenses.Select(expense => expense.Id));
        Assert.Equal(38500, list.Total);

        var oneDay = await ListAsync(Nov4, Nov4);
        Assert.Equal(5000, oneDay.Total);
    }

    [Fact]
    public async Task List_WithNothing_IsEmptyWithZeroTotal()
    {
        var list = await ListAsync(Nov3, Nov3);

        Assert.Empty(list.Expenses);
        Assert.Equal(0, list.Total);
    }

    [Fact]
    public async Task List_WithABadRange_IsRefused()
    {
        var response = await _client.GetAsync($"/api/expenses?from={Nov5}&to={Nov3}");

        Assert.Equal(["La fecha final no puede ser antes de la inicial."], (await ReadErrorsAsync(response))["to"]);
    }

    [Fact]
    public async Task Update_ChangesEverything_AndMovesItToTheNewDay()
    {
        var expense = await CreateAsync(Nov3, Alimento, 31000, "2 sacos");

        var response = await _client.PutAsJsonAsync(
            $"/api/expenses/{expense.Id}",
            new ExpenseCommand(Nov4, Otro, 6000, "Gasolina"));
        response.EnsureSuccessStatusCode();
        var updated = (await response.Content.ReadFromJsonAsync<ExpenseDetail>())!;

        Assert.Equal(expense.Id, updated.Id);
        Assert.Equal("Otro", updated.Category.Name);
        Assert.Equal(6000, updated.Amount);
        Assert.Equal(0, (await ListAsync(Nov3, Nov3)).Total);
        Assert.Equal(6000, (await ListAsync(Nov4, Nov4)).Total);
    }

    [Fact]
    public async Task Update_ToOtroWithoutADescription_IsRefused()
    {
        var expense = await CreateAsync(Nov3, Alimento, 31000);

        var response = await _client.PutAsJsonAsync(
            $"/api/expenses/{expense.Id}",
            new ExpenseCommand(Nov3, Otro, 31000, null));

        Assert.Equal(["Escriba en qué gastó."], (await ReadErrorsAsync(response))["note"]);
    }

    [Fact]
    public async Task UnknownExpense_IsNotFound_ForGetUpdateAndDelete()
    {
        var id = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/expenses/{id}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await _client.PutAsJsonAsync($"/api/expenses/{id}", new ExpenseCommand(Nov3, Alimento, 1, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync($"/api/expenses/{id}")).StatusCode);
    }

    [Fact]
    public async Task Delete_IsSoft_GoneFromTheListAndTotal_ButTheRowStays()
    {
        var kept = await CreateAsync(Nov3, Cartones, 2500);
        var deleted = await CreateAsync(Nov3, Alimento, 31000);

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/expenses/{deleted.Id}")).StatusCode);

        var list = await ListAsync(Nov3, Nov3);
        Assert.Equal([kept.Id], list.Expenses.Select(expense => expense.Id));
        Assert.Equal(2500, list.Total);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/expenses/{deleted.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync($"/api/expenses/{deleted.Id}")).StatusCode);

        using var connection = _factory.ConnectToDatabase();
        Assert.Equal(1L, TestDatabaseFolder.Scalar(connection, "SELECT IsDeleted FROM Expenses WHERE Amount = 31000"));
    }

    [Fact]
    public async Task RetiredCategory_KeepsOldExpensesReadable_ButNewOnesCannotUseIt()
    {
        var old = await CreateAsync(Nov3, Cartones, 2500);

        await RetireAsync(Cartones);

        var categories = await _client.GetFromJsonAsync<List<CategoryRef>>("/api/expense-categories");
        Assert.DoesNotContain(categories!, category => category.Id == Cartones);

        var listed = Assert.Single((await ListAsync(Nov3, Nov3)).Expenses);
        Assert.Equal(new CategoryRef(Cartones, "Cartones", false, true), listed.Category);

        var errors = await ReadErrorsAsync(await PostAsync(Nov3, Cartones, 1000));
        Assert.Equal(["Esa categoría ya no existe. Escoja otra."], errors["categoryId"]);

        // An old expense can keep its category while something else about it changes...
        var kept = await _client.PutAsJsonAsync($"/api/expenses/{old.Id}", new ExpenseCommand(Nov3, Cartones, 3000, null));
        kept.EnsureSuccessStatusCode();
        Assert.Equal(3000, (await kept.Content.ReadFromJsonAsync<ExpenseDetail>())!.Amount);

        // ...but once it leaves the category, it can't go back.
        (await _client.PutAsJsonAsync($"/api/expenses/{old.Id}", new ExpenseCommand(Nov3, Alimento, 3000, null)))
            .EnsureSuccessStatusCode();
        var back = await _client.PutAsJsonAsync($"/api/expenses/{old.Id}", new ExpenseCommand(Nov3, Cartones, 3000, null));
        Assert.Equal(["Esa categoría ya no existe. Escoja otra."], (await ReadErrorsAsync(back))["categoryId"]);
    }

    [Fact]
    public async Task RenamedCategory_ShowsItsNewNameOnOldExpenses()
    {
        var old = await CreateAsync(Nov3, Alimento, 31000);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.ExpenseCategories.SingleAsync(category => category.Id == Alimento)).Name = "Alimento de gallinas";
            await db.SaveChangesAsync();
        }

        var read = await _client.GetFromJsonAsync<ExpenseDetail>($"/api/expenses/{old.Id}");
        Assert.Equal("Alimento de gallinas", read!.Category.Name);
    }

    [Fact]
    public async Task Database_RefusesAnExpenseWithoutACategoryOrWithAZeroAmount()
    {
        using var connection = _factory.ConnectToDatabase();
        TestDatabaseFolder.Execute(connection, "PRAGMA foreign_keys = ON;");

        const string Insert =
            "INSERT INTO Expenses (Id, ExpenseDate, CategoryId, Amount, CreatedAt, UpdatedAt, IsDeleted) " +
            "VALUES ('{0}', '2024-11-03', {1}, {2}, '2024-11-03 09:00:00', '2024-11-03 09:00:00', 0)";

        var unknown = Assert.Throws<Microsoft.Data.Sqlite.SqliteException>(() =>
            TestDatabaseFolder.Execute(connection, string.Format(Insert, "a", "'nothing'", 1000)));
        Assert.Contains("FOREIGN KEY", unknown.Message);

        var zero = Assert.Throws<Microsoft.Data.Sqlite.SqliteException>(() =>
            TestDatabaseFolder.Execute(connection, string.Format(Insert, "b", $"'{Alimento.ToString().ToUpperInvariant()}'", 0)));
        Assert.Contains("CHECK", zero.Message);
    }
}
