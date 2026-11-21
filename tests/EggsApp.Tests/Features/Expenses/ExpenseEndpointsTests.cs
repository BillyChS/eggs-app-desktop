using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Expenses;
using EggsApp.Api.Features.Reports;
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
    private static readonly Guid Vitaminas = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0002");
    private static readonly Guid Burucha = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0004");
    private static readonly Guid Cartones = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0005");
    private static readonly Guid Plasticos = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0006");
    private static readonly Guid Equipo = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0007");
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

    private async Task<ExpenseDetail> CreateUnderNewTypeAsync(string date, string name, long amount, string? note = null)
    {
        var response = await _client.PostAsJsonAsync("/api/expenses", new ExpenseCommand(date, null, amount, note, name));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ExpenseDetail>())!;
    }

    private async Task<List<CategorySummary>> CategoriesAsync(bool includeRetired = false) =>
        (await _client.GetFromJsonAsync<List<CategorySummary>>(
            $"/api/expense-categories?includeRetired={includeRetired.ToString().ToLowerInvariant()}"))!;

    /// <summary>An expense saved under "Otro" before "Otro" made types of its own: its note says what it was.</summary>
    private async Task<Guid> InsertOldOtroAsync(string date, long amount, string note)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var expense = new Expense { ExpenseDate = DateOnly.Parse(date), CategoryId = Otro, Amount = amount, Note = note };
        db.Expenses.Add(expense);
        await db.SaveChangesAsync();
        return expense.Id;
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
    public async Task Categories_AreTheSeededOnes_Alphabetically_OtroLast_OnlyOtroNeedsADescription()
    {
        var categories = await CategoriesAsync();

        Assert.Equal(
            ["Alimento", "Burucha", "Cartones", "Desparasitantes", "Equipo", "Plásticos/Envoltorios", "Vitaminas", "Otro"],
            categories.Select(category => category.Name));
        Assert.Equal([Otro], categories.Where(category => category.NeedsDescription).Select(category => category.Id));
        Assert.All(categories, category => Assert.False(category.IsRetired));
        Assert.All(categories, category => Assert.Equal(0, category.ExpenseCount));
    }

    [Fact]
    public async Task Categories_CountTheirExpenses_OfAnyDate_NotTheDeletedOnes()
    {
        await CreateAsync(Nov3, Alimento, 1000);
        await CreateAsync("2024-01-15", Alimento, 1000);
        var deleted = await CreateAsync(Nov3, Alimento, 1000);
        await _client.DeleteAsync($"/api/expenses/{deleted.Id}");
        await CreateAsync(Nov4, Cartones, 1000);

        var counts = (await CategoriesAsync()).ToDictionary(category => category.Name, category => category.ExpenseCount);

        Assert.Equal(2, counts["Alimento"]);
        Assert.Equal(1, counts["Cartones"]);
        Assert.Equal(0, counts["Equipo"]);
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
        Assert.Equal(["Elija el tipo de gasto."], errors["categoryId"]);
        Assert.Equal(["Escriba el monto."], errors["amount"]);
    }

    [Theory]
    [InlineData(0L)]
    [InlineData(-5L)]
    public async Task Create_WithAnAmountBelowOne_IsRefused(long amount)
    {
        var errors = await ReadErrorsAsync(await PostAsync(Nov3, Alimento, amount));

        Assert.Equal(["Escriba el monto."], errors["amount"]);
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
    [InlineData("Gasolina")]
    public async Task Otro_IsNeverSavedItself_ItAsksWhatItWas(string? note)
    {
        var errors = await ReadErrorsAsync(await PostAsync(Nov3, Otro, 5000, note));

        Assert.Equal(["Escriba qué gasto fue."], errors["newCategory"]);
    }

    [Fact]
    public async Task NewCategory_AddsTheType_AndTheExpenseGoesUnderIt_WithItsOwnNote()
    {
        var expense = await CreateUnderNewTypeAsync(Nov3, "  gasolina   súper ", 5000, "Para el carro");

        Assert.Equal("Gasolina súper", expense.Category.Name);
        Assert.False(expense.Category.NeedsDescription);
        Assert.False(expense.Category.IsRetired);
        Assert.Equal("Para el carro", expense.Note);

        var categories = await CategoriesAsync();
        var added = Assert.Single(categories, category => category.Id == expense.Category.Id);
        Assert.Equal(1, added.ExpenseCount);
        // In its alphabetical place, with "Otro" still last.
        Assert.Equal(
            ["Alimento", "Burucha", "Cartones", "Desparasitantes", "Equipo", "Gasolina súper", "Plásticos/Envoltorios", "Vitaminas", "Otro"],
            categories.Select(category => category.Name));
    }

    [Theory]
    [InlineData("ALIMENTO")]
    [InlineData("alimento")]
    [InlineData("  Alimento ")]
    public async Task NewCategory_WithTheNameOfAType_ReusesIt(string name)
    {
        var expense = await CreateUnderNewTypeAsync(Nov3, name, 1000);

        Assert.Equal(Alimento, expense.Category.Id);
        Assert.Equal(8, (await CategoriesAsync()).Count);
    }

    [Fact]
    public async Task NewCategory_IgnoresAccentsAndCase_BothWays()
    {
        var plain = await CreateUnderNewTypeAsync(Nov3, "plasticos/envoltorios", 1000);
        var first = await CreateUnderNewTypeAsync(Nov3, "Gasolína", 1000);
        var second = await CreateUnderNewTypeAsync(Nov4, "GASOLINA", 1000);

        Assert.Equal(Plasticos, plain.Category.Id);
        Assert.Equal(first.Category.Id, second.Category.Id);
        // The name stays as it was first written.
        Assert.Equal("Gasolína", second.Category.Name);
        Assert.Equal(9, (await CategoriesAsync()).Count);
    }

    [Fact]
    public async Task NewCategory_WithTheNameOfARetiredType_ReactivatesIt()
    {
        var old = await CreateAsync(Nov3, Vitaminas, 1000);
        await RetireAsync(Vitaminas);

        var expense = await CreateUnderNewTypeAsync(Nov4, "vitaminas", 2000);

        Assert.Equal(Vitaminas, expense.Category.Id);
        Assert.False(expense.Category.IsRetired);
        var vitaminas = Assert.Single(await CategoriesAsync(), category => category.Id == Vitaminas);
        Assert.Equal(2, vitaminas.ExpenseCount);
        Assert.False((await _client.GetFromJsonAsync<ExpenseDetail>($"/api/expenses/{old.Id}"))!.Category.IsRetired);
    }

    [Theory]
    [InlineData("otro")]
    [InlineData("OTRO")]
    [InlineData(" Otró ")]
    public async Task NewCategory_CalledOtro_IsRefused(string name)
    {
        var response = await _client.PostAsJsonAsync("/api/expenses", new ExpenseCommand(Nov3, null, 1000, null, name));

        Assert.Equal(["Escriba qué gasto fue, no «Otro»."], (await ReadErrorsAsync(response))["newCategory"]);
    }

    [Fact]
    public async Task NewCategory_OfFortyLettersIsSaved_ButNotFortyOne()
    {
        var forty = new string('a', 40);
        Assert.Equal(40, (await CreateUnderNewTypeAsync(Nov3, forty, 1000)).Category.Name.Length);

        var response = await _client.PostAsJsonAsync(
            "/api/expenses",
            new ExpenseCommand(Nov3, null, 1000, null, new string('b', 41)));
        Assert.Equal(["El nombre no puede tener más de 40 letras."], (await ReadErrorsAsync(response))["newCategory"]);
    }

    [Fact]
    public async Task NewCategory_TakesThePlaceOfTheCategoryId()
    {
        var response = await _client.PostAsJsonAsync("/api/expenses", new ExpenseCommand(Nov3, Otro, 1000, null, "Candado"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("Candado", (await response.Content.ReadFromJsonAsync<ExpenseDetail>())!.Category.Name);
    }

    [Fact]
    public async Task NewCategory_RefusedForAnotherField_AddsNoType()
    {
        var errors = await ReadErrorsAsync(
            await _client.PostAsJsonAsync("/api/expenses", new ExpenseCommand(Nov3, null, 0, null, "Gasolina")));

        Assert.Equal(["Escriba el monto."], errors["amount"]);
        Assert.DoesNotContain(await CategoriesAsync(true), category => category.Name == "Gasolina");
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
        var later = await CreateAsync(Nov4, Equipo, 5000);
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
        Assert.Empty(list.ByCategory);
    }

    [Fact]
    public async Task List_AddsUpEachCategory_LargestFirst_WithHowManyExpenses_AndOldOtrosUnderOneName()
    {
        await CreateAsync(Nov3, Alimento, 31000);
        await CreateAsync(Nov4, Alimento, 4000);
        await InsertOldOtroAsync(Nov3, 5000, "Gasolina");
        await InsertOldOtroAsync(Nov4, 2500, "Candado");
        await CreateAsync(Nov4, Cartones, 7500);
        // Outside the range.
        await CreateAsync(Nov5, Cartones, 90000);

        var list = await ListAsync(Nov3, Nov4);

        Assert.Equal(
            [
                new CategoryTotal(Alimento, "Alimento", 35000, 2),
                // A tie goes by name.
                new CategoryTotal(Cartones, "Cartones", 7500, 1),
                new CategoryTotal(Otro, "Otro", 7500, 2),
            ],
            list.ByCategory);
        Assert.Equal(list.Total, list.ByCategory.Sum(category => category.Total));
        // An old "Otro" says what each one was in its note.
        Assert.Equal(
            ["Candado", "Gasolina"],
            list.Expenses.Where(expense => expense.Category.Id == Otro).Select(expense => expense.Note));
    }

    // Gastos' "Esta semana": Monday 28 October to Sunday 3 November 2024, across the end of a month.
    [Fact]
    public async Task List_OfAWeekAcrossTheEndOfAMonth_IncludesBothMonthsAndNothingOutside()
    {
        await CreateAsync("2024-10-27", Alimento, 100000);
        var monday = await CreateAsync("2024-10-28", Alimento, 1000);
        var lastOfMonth = await CreateAsync("2024-10-31", Cartones, 2000);
        var sunday = await CreateAsync(Nov3, Equipo, 4000);
        await CreateAsync(Nov4, Alimento, 100000);

        var week = await ListAsync("2024-10-28", Nov3);

        Assert.Equal([sunday.Id, lastOfMonth.Id, monday.Id], week.Expenses.Select(expense => expense.Id));
        Assert.Equal(7000, week.Total);
        Assert.Equal(
            [
                new CategoryTotal(Equipo, "Equipo", 4000, 1),
                new CategoryTotal(Cartones, "Cartones", 2000, 1),
                new CategoryTotal(Alimento, "Alimento", 1000, 1),
            ],
            week.ByCategory);
    }

    [Fact]
    public async Task Gastos_AndResumenes_ShowTheSameTotals_ForTheSameMonth()
    {
        await CreateAsync("2024-10-31", Alimento, 100000);
        await CreateAsync("2024-11-01", Alimento, 31000);
        await CreateUnderNewTypeAsync("2024-11-15", "Gasolina", 5000);
        await CreateAsync("2024-11-15", Cartones, 5000);
        var deleted = await CreateAsync("2024-11-20", Equipo, 9000);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/expenses/{deleted.Id}")).StatusCode);
        await CreateAsync("2024-11-30", Equipo, 12000);
        await CreateAsync("2024-12-01", Equipo, 100000);

        var gastos = await ListAsync("2024-11-01", "2024-11-30");
        var resumenes = (await _client.GetFromJsonAsync<SummaryResponse>("/api/reports/summary?from=2024-11-01&to=2024-11-30"))!;

        Assert.Equal(53000, gastos.Total);
        Assert.Equal(gastos.Total, resumenes.Spent.Total);
        Assert.Equal(
            gastos.ByCategory.Select(category => new CategorySpent(category.Name, category.Total)),
            resumenes.Spent.ByCategory);
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
            new ExpenseCommand(Nov4, null, 6000, "Para el carro", "Gasolina"));
        response.EnsureSuccessStatusCode();
        var updated = (await response.Content.ReadFromJsonAsync<ExpenseDetail>())!;

        Assert.Equal(expense.Id, updated.Id);
        Assert.Equal("Gasolina", updated.Category.Name);
        Assert.Equal("Para el carro", updated.Note);
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

        Assert.Equal(["Escriba qué gasto fue."], (await ReadErrorsAsync(response))["newCategory"]);
    }

    [Fact]
    public async Task Update_OfAnOldOtro_MovesItToTheTypeItNames()
    {
        var id = await InsertOldOtroAsync(Nov3, 5000, "Gasolina");
        Assert.Equal("Otro", (await _client.GetFromJsonAsync<ExpenseDetail>($"/api/expenses/{id}"))!.Category.Name);

        var response = await _client.PutAsJsonAsync($"/api/expenses/{id}", new ExpenseCommand(Nov3, null, 5000, null, "Gasolina"));
        response.EnsureSuccessStatusCode();
        var updated = (await response.Content.ReadFromJsonAsync<ExpenseDetail>())!;

        Assert.Equal("Gasolina", updated.Category.Name);
        Assert.Null(updated.Note);
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

        Assert.DoesNotContain(await CategoriesAsync(), category => category.Id == Cartones);

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
    public async Task AddType_IsCreated_ThenReused_WithTheSameRulesAsOtro()
    {
        var created = await _client.PostAsJsonAsync("/api/expense-categories", new CategoryCommand("  gasolina "));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var gasolina = (await created.Content.ReadFromJsonAsync<CategorySummary>())!;
        Assert.Equal(new CategorySummary(gasolina.Id, "Gasolina", false, false, 0), gasolina);

        var again = await _client.PostAsJsonAsync("/api/expense-categories", new CategoryCommand("GASOLÍNA"));
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(gasolina.Id, (await again.Content.ReadFromJsonAsync<CategorySummary>())!.Id);

        var seeded = await _client.PostAsJsonAsync("/api/expense-categories", new CategoryCommand("alimento"));
        Assert.Equal(HttpStatusCode.OK, seeded.StatusCode);
        Assert.Equal(Alimento, (await seeded.Content.ReadFromJsonAsync<CategorySummary>())!.Id);

        Assert.Equal(9, (await CategoriesAsync()).Count);
    }

    [Theory]
    [InlineData(null, "Escriba el nombre del tipo.")]
    [InlineData("   ", "Escriba el nombre del tipo.")]
    [InlineData("otro", "Escriba qué gasto fue, no «Otro».")]
    [InlineData("12345678901234567890123456789012345678901", "El nombre no puede tener más de 40 letras.")]
    public async Task AddType_WithABadName_IsRefused(string? name, string message)
    {
        var response = await _client.PostAsJsonAsync("/api/expense-categories", new CategoryCommand(name));

        Assert.Equal([message], (await ReadErrorsAsync(response))["name"]);
    }

    [Fact]
    public async Task AddType_WithTheNameOfARetiredOne_ReactivatesIt()
    {
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/expense-categories/{Burucha}")).StatusCode);

        var response = await _client.PostAsJsonAsync("/api/expense-categories", new CategoryCommand("burucha"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var burucha = Assert.Single(await CategoriesAsync(), category => category.Id == Burucha);
        Assert.Equal("Burucha", burucha.Name);
    }

    [Fact]
    public async Task RetireType_HidesItFromNewExpenses_ButItsExpensesKeepIt()
    {
        var old = await CreateAsync(Nov3, Cartones, 2500);

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/expense-categories/{Cartones}")).StatusCode);

        Assert.DoesNotContain(await CategoriesAsync(), category => category.Id == Cartones);
        var retired = Assert.Single(await CategoriesAsync(true), category => category.Id == Cartones);
        Assert.True(retired.IsRetired);
        Assert.Equal(1, retired.ExpenseCount);

        var listed = Assert.Single((await ListAsync(Nov3, Nov3)).Expenses);
        Assert.Equal(new CategoryRef(Cartones, "Cartones", false, true), listed.Category);
        var errors = await ReadErrorsAsync(await PostAsync(Nov3, Cartones, 1000));
        Assert.Equal(["Esa categoría ya no existe. Escoja otra."], errors["categoryId"]);
        (await _client.PutAsJsonAsync($"/api/expenses/{old.Id}", new ExpenseCommand(Nov4, Cartones, 3000, null)))
            .EnsureSuccessStatusCode();

        // Already retired: as if it weren't there.
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync($"/api/expense-categories/{Cartones}")).StatusCode);
    }

    [Fact]
    public async Task RetireType_RefusesOtro_AndAnUnknownOneIsNotFound()
    {
        var otro = await _client.DeleteAsync($"/api/expense-categories/{Otro}");
        Assert.Equal(HttpStatusCode.Conflict, otro.StatusCode);
        Assert.Equal("El tipo Otro no se puede eliminar.", (await otro.Content.ReadFromJsonAsync<Refusal>())!.Message);
        Assert.Contains(await CategoriesAsync(), category => category.Id == Otro);

        var unknown = await _client.DeleteAsync($"/api/expense-categories/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
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
