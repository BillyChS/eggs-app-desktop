using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Features.Sales;
using EggsApp.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace EggsApp.Tests.Features.Sales;

// A new factory per test, because each test needs to know exactly which sales exist.
public sealed class SaleEndpointsTests : IDisposable
{
    private const string Day = "2024-11-03";
    private const string Url = "/api/sales";

    private static readonly SaleItemCommand ThreeOf15 = new("A", 3, 1000);
    private static readonly SaleItemCommand OneOf30 = new("B", 1, 2000);

    private readonly EggsAppFactory _factory = new();
    private readonly HttpClient _client;

    public SaleEndpointsTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private static string Today => DateOnly.FromDateTime(DateTime.Now).ToString("yyyy-MM-dd");

    private async Task<SaleDetail> CreateAsync(string date, params SaleItemCommand[] items)
    {
        var response = await _client.PostAsJsonAsync(Url, new SaleCommand(date, items));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SaleDetail>())!;
    }

    private async Task<SaleListResponse> ListAsync(string from, string to) =>
        (await _client.GetFromJsonAsync<SaleListResponse>($"{Url}?from={from}&to={to}"))!;

    private async Task<Dictionary<string, long>> LastPricesAsync() =>
        (await _client.GetFromJsonAsync<Dictionary<string, long>>($"{Url}/last-prices"))!;

    private async Task<long> CountSalesAsync() =>
        (await ListAsync("2000-01-01", Today)).Sales.Count;

    private static async Task<IDictionary<string, string[]>> ReadErrorsAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        return problem!.Errors;
    }

    [Fact]
    public async Task Create_StoresTheLinesAndTotalsAndSaysWhere()
    {
        var response = await _client.PostAsJsonAsync(Url, new SaleCommand(Day, [ThreeOf15, OneOf30]));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<SaleDetail>())!;
        Assert.Equal($"/api/sales/{created.Id}", response.Headers.Location!.ToString());
        Assert.Equal(new DateOnly(2024, 11, 3), created.Date);
        Assert.Equal(5000, created.Total);
        Assert.Equal(
            [new SaleItemDetail("A", 3, 1000, 3000), new SaleItemDetail("B", 1, 2000, 2000)],
            created.Items);

        var read = await _client.GetFromJsonAsync<SaleDetail>(response.Headers.Location);
        Assert.Equal(created.Id, read!.Id);
        Assert.Equal(created.Items, read.Items);
    }

    [Fact]
    public async Task Create_StoresWhatWasCalculatedAndDatesWithoutTime()
    {
        await CreateAsync(Day, ThreeOf15, OneOf30);

        using var connection = _factory.ConnectToDatabase();
        Assert.Equal(5000L, TestDatabaseFolder.Scalar(connection, "SELECT Total FROM Sales"));
        Assert.Equal(Day, TestDatabaseFolder.Scalar(connection, "SELECT SaleDate FROM Sales"));
        Assert.Equal(5000L, TestDatabaseFolder.Scalar(connection, "SELECT SUM(LineTotal) FROM SaleItems"));
        Assert.Equal("A", TestDatabaseFolder.Scalar(connection, "SELECT CartonType FROM SaleItems WHERE Position = 0"));
    }

    [Fact]
    public async Task Create_IgnoresATotalSentByTheClient()
    {
        var response = await _client.PostAsJsonAsync(Url, new
        {
            date = Day,
            total = 1,
            items = new[] { new { cartonType = "A", quantity = 3, unitPrice = 1000, lineTotal = 1 } },
        });

        var created = (await response.Content.ReadFromJsonAsync<SaleDetail>())!;
        Assert.Equal(3000, created.Total);
        Assert.Equal(3000, created.Items[0].LineTotal);
    }

    [Fact]
    public async Task Create_KeepsTheSameTypeAtDifferentPricesInTheOrderEntered()
    {
        var created = await CreateAsync(Day, new("B", 1, 2100), new("A", 2, 1000), new("B", 1, 2000), new("A", 1, 900));

        var read = await _client.GetFromJsonAsync<SaleDetail>($"{Url}/{created.Id}");

        Assert.Equal([2100, 1000, 2000, 900], read!.Items.Select(item => item.UnitPrice));
        Assert.Equal(7000, read.Total);
    }

    [Theory]
    [InlineData(null, "Escoja la fecha")]
    [InlineData("", "Escoja la fecha")]
    [InlineData("03/11/2024", "no es válida")]
    [InlineData("2024-02-30", "no es válida")]
    [InlineData("0024-11-03", "Revise el año")]
    [InlineData("1999-12-31", "Revise el año")]
    public async Task Create_RefusesABadDateInSpanish(string? date, string message)
    {
        var response = await _client.PostAsJsonAsync(Url, new SaleCommand(date, [ThreeOf15]));

        Assert.Contains(message, (await ReadErrorsAsync(response))["date"][0]);
        Assert.Equal(0, await CountSalesAsync());
    }

    [Fact]
    public async Task Create_RefusesTomorrowButAcceptsTodayAndTheEarliestDate()
    {
        var tomorrow = DateOnly.FromDateTime(DateTime.Now).AddDays(1).ToString("yyyy-MM-dd");

        var response = await _client.PostAsJsonAsync(Url, new SaleCommand(tomorrow, [ThreeOf15]));

        Assert.Equal(["La fecha no puede ser futura."], (await ReadErrorsAsync(response))["date"]);
        Assert.Equal(Today, (await CreateAsync(Today, ThreeOf15)).Date.ToString("yyyy-MM-dd"));
        await CreateAsync("2000-01-01", ThreeOf15);
    }

    [Fact]
    public async Task Create_NeedsAtLeastOneLineAndAtMostTwenty()
    {
        var none = await _client.PostAsJsonAsync(Url, new SaleCommand(Day, []));
        var missing = await _client.PostAsJsonAsync(Url, new SaleCommand(Day, null));
        var tooMany = await _client.PostAsJsonAsync(Url, new SaleCommand(Day, [.. Enumerable.Repeat(ThreeOf15, 21)]));

        Assert.Equal(["Agregue al menos un cartón."], (await ReadErrorsAsync(none))["items"]);
        Assert.Equal(["Agregue al menos un cartón."], (await ReadErrorsAsync(missing))["items"]);
        Assert.Contains("20", (await ReadErrorsAsync(tooMany))["items"][0]);
        Assert.Equal(0, await CountSalesAsync());

        await CreateAsync(Day, [.. Enumerable.Repeat(ThreeOf15, 20)]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("C")]
    [InlineData("a")]
    [InlineData("0")]
    public async Task Create_RefusesAnUnknownCartonTypeOnThatLine(string? cartonType)
    {
        var response = await _client.PostAsJsonAsync(
            Url,
            new SaleCommand(Day, [ThreeOf15, new(cartonType, 1, 1000)]));

        var errors = await ReadErrorsAsync(response);
        Assert.Equal(["Escoja el tipo de cartón."], errors["items[1].cartonType"]);
        Assert.Single(errors);
    }

    [Theory]
    [InlineData(null, "Escriba la cantidad")]
    [InlineData(0L, "Escriba la cantidad")]
    [InlineData(-1L, "Escriba la cantidad")]
    [InlineData(10_001L, "10.000")]
    public async Task Create_RefusesABadQuantityOnThatLine(long? quantity, string message)
    {
        var response = await _client.PostAsJsonAsync(Url, new SaleCommand(Day, [new("A", quantity, 1000)]));

        Assert.Contains(message, (await ReadErrorsAsync(response))["items[0].quantity"][0]);
    }

    [Fact]
    public async Task Create_RefusesAQuantityWithDecimals()
    {
        var response = await _client.PostAsJsonAsync(Url, new
        {
            date = Day,
            items = new[] { new { cartonType = "A", quantity = 2.5, unitPrice = 1000 } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, await CountSalesAsync());
    }

    [Theory]
    [InlineData(null, "Escriba el precio")]
    [InlineData(0L, "Escriba el precio")]
    [InlineData(-1L, "Escriba el precio")]
    [InlineData(1_000_001L, "1.000.000")]
    public async Task Create_RefusesABadPriceOnThatLine(long? unitPrice, string message)
    {
        var response = await _client.PostAsJsonAsync(Url, new SaleCommand(Day, [new("A", 1, unitPrice)]));

        Assert.Contains(message, (await ReadErrorsAsync(response))["items[0].unitPrice"][0]);
    }

    [Fact]
    public async Task Create_ReportsEveryProblemAtOnce()
    {
        var response = await _client.PostAsJsonAsync(Url, new SaleCommand(null, [new(null, 0, 0), null]));

        var errors = await ReadErrorsAsync(response);
        Assert.Equal(
            [
                "date",
                "items[0].cartonType",
                "items[0].quantity",
                "items[0].unitPrice",
                "items[1].cartonType",
                "items[1].quantity",
                "items[1].unitPrice",
            ],
            errors.Keys.Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Create_TheLargestAllowedSaleAddsUpExactly()
    {
        var largest = new SaleItemCommand("A", SaleItem.MaxQuantity, SaleItem.MaxUnitPrice);

        var created = await CreateAsync(Day, [.. Enumerable.Repeat(largest, SaleItem.MaxPerSale)]);

        Assert.Equal(200_000_000_000, created.Total);
    }

    [Fact]
    public async Task List_ReturnsOnlyThatDayWithItsTotalNewestFirst()
    {
        await CreateAsync("2024-11-02", new SaleItemCommand("A", 1, 100));
        var first = await CreateAsync(Day, ThreeOf15);
        var second = await CreateAsync(Day, OneOf30);
        await CreateAsync("2024-11-04", new SaleItemCommand("A", 1, 700));

        var list = await ListAsync(Day, Day);

        Assert.Equal([second.Id, first.Id], list.Sales.Select(sale => sale.Id));
        Assert.Equal(5000, list.CashTotal);
    }

    [Fact]
    public async Task List_RangeIncludesBothEndsAndAddsThemUp()
    {
        await CreateAsync("2024-10-31", new SaleItemCommand("A", 1, 1));
        await CreateAsync("2024-11-01", new SaleItemCommand("A", 1, 10));
        await CreateAsync("2024-11-30", new SaleItemCommand("A", 1, 100));
        await CreateAsync("2024-12-01", new SaleItemCommand("A", 1, 1000));

        var list = await ListAsync("2024-11-01", "2024-11-30");

        Assert.Equal(110, list.CashTotal);
        Assert.Equal(
            [new DateOnly(2024, 11, 30), new DateOnly(2024, 11, 1)],
            list.Sales.Select(sale => sale.Date));
    }

    [Fact]
    public async Task List_ADayWithNoSalesIsEmptyWithATotalOfZero()
    {
        var list = await ListAsync(Day, Day);

        Assert.Empty(list.Sales);
        Assert.Equal(0, list.CashTotal);
    }

    // At 7 pm in Costa Rica it's already the next day in UTC. A date with no time can't move, whatever the clock says.
    [Fact]
    public async Task List_TodaysSaleStaysOnTodayAtAnyHour()
    {
        await CreateAsync(Today, ThreeOf15);

        Assert.Equal(3000, (await ListAsync(Today, Today)).CashTotal);

        var tomorrow = DateOnly.FromDateTime(DateTime.Now).AddDays(1).ToString("yyyy-MM-dd");
        Assert.Equal(0, (await ListAsync(tomorrow, tomorrow)).CashTotal);
    }

    [Theory]
    [InlineData("", "")]
    [InlineData("2024-11-03", "")]
    [InlineData("", "2024-11-03")]
    [InlineData("03/11/2024", "2024-11-03")]
    public async Task List_RefusesMissingOrBadDates(string from, string to)
    {
        var response = await _client.GetAsync($"{Url}?from={from}&to={to}");

        await ReadErrorsAsync(response);
    }

    [Fact]
    public async Task List_RefusesARangeThatEndsBeforeItStarts()
    {
        var response = await _client.GetAsync($"{Url}?from=2024-11-04&to=2024-11-03");

        Assert.Contains("to", (await ReadErrorsAsync(response)).Keys);
    }

    [Fact]
    public async Task Update_KeepsTheIdAndReplacesEverything()
    {
        var created = await CreateAsync(Day, ThreeOf15, OneOf30);

        var response = await _client.PutAsJsonAsync(
            $"{Url}/{created.Id}",
            new SaleCommand("2024-11-02", [new("B", 2, 2500)]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var expected = new SaleItemDetail("B", 2, 2500, 5000);
        var updated = (await response.Content.ReadFromJsonAsync<SaleDetail>())!;
        Assert.Equal(created.Id, updated.Id);
        Assert.Equal(new DateOnly(2024, 11, 2), updated.Date);
        Assert.Equal(5000, updated.Total);
        Assert.Equal([expected], updated.Items);

        var read = await _client.GetFromJsonAsync<SaleDetail>($"{Url}/{created.Id}");
        Assert.Equal([expected], read!.Items);
    }

    [Fact]
    public async Task Update_MovesTheSaleToItsNewDay()
    {
        var created = await CreateAsync(Day, ThreeOf15);

        await _client.PutAsJsonAsync($"{Url}/{created.Id}", new SaleCommand("2024-11-02", [ThreeOf15]));

        Assert.Empty((await ListAsync(Day, Day)).Sales);
        Assert.Equal(3000, (await ListAsync("2024-11-02", "2024-11-02")).CashTotal);
    }

    [Fact]
    public async Task Update_KeepsTheOldLinesSoftDeleted()
    {
        var created = await CreateAsync(Day, ThreeOf15, OneOf30);

        await _client.PutAsJsonAsync($"{Url}/{created.Id}", new SaleCommand(Day, [ThreeOf15]));

        using var connection = _factory.ConnectToDatabase();
        Assert.Equal(2L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM SaleItems WHERE IsDeleted = 1"));
        Assert.Equal(1L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM SaleItems WHERE IsDeleted = 0"));
        Assert.Equal(1L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM Sales"));
    }

    [Fact]
    public async Task Update_WithTheSameValuesStillMarksTheSaleAsChanged()
    {
        var created = await CreateAsync(Day, ThreeOf15);

        await _client.PutAsJsonAsync($"{Url}/{created.Id}", new SaleCommand(Day, [ThreeOf15]));

        using var connection = _factory.ConnectToDatabase();
        Assert.Equal(1L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM Sales WHERE UpdatedAt > CreatedAt"));
    }

    [Fact]
    public async Task Update_ValidatesLikeCreateAndChangesNothing()
    {
        var created = await CreateAsync(Day, ThreeOf15);

        var response = await _client.PutAsJsonAsync($"{Url}/{created.Id}", new SaleCommand(Day, [new("A", 0, 1000)]));

        Assert.Contains("items[0].quantity", (await ReadErrorsAsync(response)).Keys);
        var read = await _client.GetFromJsonAsync<SaleDetail>($"{Url}/{created.Id}");
        Assert.Equal(3, read!.Items[0].Quantity);
    }

    [Fact]
    public async Task UnknownSale_IsNotFound()
    {
        var url = $"{Url}/{Guid.NewGuid()}";
        var command = new SaleCommand(Day, [ThreeOf15]);

        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.PutAsJsonAsync(url, command)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync(url)).StatusCode);
    }

    [Fact]
    public async Task Delete_HidesTheSaleAndTakesItOutOfTheTotal()
    {
        var kept = await CreateAsync(Day, OneOf30);
        var deleted = await CreateAsync(Day, ThreeOf15);
        var url = $"{Url}/{deleted.Id}";

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync(url)).StatusCode);

        var list = await ListAsync(Day, Day);
        Assert.Equal([kept.Id], list.Sales.Select(sale => sale.Id));
        Assert.Equal(2000, list.CashTotal);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync(url)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await _client.PutAsJsonAsync(url, new SaleCommand(Day, [ThreeOf15]))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync(url)).StatusCode);
    }

    [Fact]
    public async Task Delete_KeepsTheRowsAndMarksTheSaleAndItsLines()
    {
        var created = await CreateAsync(Day, ThreeOf15, OneOf30);

        await _client.DeleteAsync($"{Url}/{created.Id}");

        using var connection = _factory.ConnectToDatabase();
        Assert.Equal(1L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM Sales WHERE IsDeleted = 1"));
        Assert.Equal(2L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM SaleItems WHERE IsDeleted = 1"));
        Assert.Equal(0L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM SaleItems WHERE IsDeleted = 0"));
    }

    [Fact]
    public async Task LastPrices_WithNoSalesIsEmpty()
    {
        Assert.Empty(await LastPricesAsync());
    }

    [Fact]
    public async Task LastPrices_LeavesOutATypeNeverSold()
    {
        await CreateAsync(Day, ThreeOf15);

        var prices = await LastPricesAsync();

        Assert.Equal(1000, prices["A"]);
        Assert.False(prices.ContainsKey("B"));
    }

    [Fact]
    public async Task LastPrices_GivesTheLatestPricePerType()
    {
        await CreateAsync("2024-11-01", new("A", 1, 800), new("B", 1, 1800));
        await CreateAsync("2024-11-02", new SaleItemCommand("A", 1, 900));
        await CreateAsync("2024-11-02", new SaleItemCommand("A", 1, 950));

        var prices = await LastPricesAsync();

        Assert.Equal(950, prices["A"]);
        Assert.Equal(1800, prices["B"]);
    }

    [Fact]
    public async Task LastPrices_WithinASaleTheLastLineWins()
    {
        await CreateAsync(Day, new("A", 1, 900), new("A", 1, 950), new("B", 1, 1000));

        Assert.Equal(950, (await LastPricesAsync())["A"]);
    }

    // Typing in last week's sale, at last week's price, must not change what today's sale starts with.
    [Fact]
    public async Task LastPrices_GoesByTheDayOfTheSaleNotWhenItWasTyped()
    {
        await CreateAsync("2024-11-03", new SaleItemCommand("A", 1, 1000));
        await CreateAsync("2024-10-20", new SaleItemCommand("A", 1, 800));

        Assert.Equal(1000, (await LastPricesAsync())["A"]);
    }

    [Fact]
    public async Task LastPrices_IgnoresDeletedSalesAndReplacedLines()
    {
        await CreateAsync("2024-11-01", new SaleItemCommand("A", 1, 800));
        var deleted = await CreateAsync("2024-11-02", new SaleItemCommand("A", 1, 900));
        var edited = await CreateAsync("2024-11-03", new SaleItemCommand("B", 1, 2000));

        await _client.DeleteAsync($"{Url}/{deleted.Id}");
        Assert.Equal(800, (await LastPricesAsync())["A"]);

        await _client.PutAsJsonAsync($"{Url}/{edited.Id}", new SaleCommand("2024-11-03", [new("B", 1, 2200)]));
        Assert.Equal(2200, (await LastPricesAsync())["B"]);

        await _client.PutAsJsonAsync($"{Url}/{edited.Id}", new SaleCommand("2024-11-03", [ThreeOf15]));
        Assert.False((await LastPricesAsync()).ContainsKey("B"));
    }
}
