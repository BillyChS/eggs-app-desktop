using System.Windows;
using EggsApp.Api.Hosting;
using Microsoft.Web.WebView2.Core;

namespace EggsApp.Desktop;

public partial class MainWindow : Window
{
    private readonly FailureLog _log;
    private Uri? _appUrl;
    private bool _uiShown;

    public MainWindow(FailureLog log)
    {
        _log = log;
        InitializeComponent();
        OpeningText.Text = UiText.Opening;
    }

    public async Task LoadAppAsync(Uri appUrl, string userDataFolder)
    {
        _appUrl = appUrl;

        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
        await Browser.EnsureCoreWebView2Async(environment);

        var browser = Browser.CoreWebView2;
        ApplySettings(browser.Settings);

        browser.NavigationStarting += OnNavigationStarting;
        browser.NewWindowRequested += OnNewWindowRequested;
        browser.NavigationCompleted += OnNavigationCompleted;
        browser.ProcessFailed += OnProcessFailed;

        browser.Navigate(appUrl.ToString());
    }

    public void BringToFront()
    {
        if (WindowState == WindowState.Minimized)
        {
            WindowState = WindowState.Maximized;
        }

        Activate();

        // Raises the window even if Windows refuses to give it the foreground.
        Topmost = true;
        Topmost = false;
    }

    private static void ApplySettings(CoreWebView2Settings settings)
    {
#if !DEBUG
        // Hides the browser feel. Debug keeps the defaults, including dev tools.
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreDevToolsEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.IsPinchZoomEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsSwipeNavigationEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
#endif
    }

    private bool IsAppUrl(string url) =>
        _appUrl is not null
        && Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && Uri.Compare(uri, _appUrl, UriComponents.SchemeAndServer, UriFormat.Unescaped, StringComparison.OrdinalIgnoreCase) == 0;

    // The app is the only thing this window ever shows: a stray link must not turn it into a browser.
    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!IsAppUrl(e.Uri))
        {
            e.Cancel = true;
        }
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e) => e.Handled = true;

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        var loaded = e.IsSuccess && e.HttpStatusCode < 400;

        if (loaded && !_uiShown)
        {
            _uiShown = true;
            OpeningText.Visibility = Visibility.Collapsed;
            Browser.Visibility = Visibility.Visible;
            Browser.Focus();
        }
        else if (!loaded && !_uiShown && e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
        {
            _log.Write("Desktop", $"The UI failed to load: {e.WebErrorStatus}, HTTP {e.HttpStatusCode}.");
            Dispatcher.BeginInvoke(() => ExitWithMessage(UiText.StartFailed));
        }
    }

    private void OnProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        _log.Write("Desktop", $"WebView2 process failed: {e.ProcessFailedKind}, {e.Reason}, exit code {e.ExitCode}.");

        // Other kinds (GPU, utility, frames) recover on their own. Dialogs wait until this handler has returned.
        switch (e.ProcessFailedKind)
        {
            case CoreWebView2ProcessFailedKind.BrowserProcessExited:
                Dispatcher.BeginInvoke(() => ExitWithMessage(UiText.BrowserClosed));
                break;

            case CoreWebView2ProcessFailedKind.RenderProcessExited:
            case CoreWebView2ProcessFailedKind.RenderProcessUnresponsive:
                Dispatcher.BeginInvoke(OfferReload);
                break;
        }
    }

    private void OfferReload()
    {
        if (FailureDialog.Confirm(UiText.ReloadPrompt))
        {
            Browser.CoreWebView2?.Reload();
        }
    }

    private static void ExitWithMessage(string message)
    {
        FailureDialog.ShowMessage(message);
        Application.Current.Shutdown(1);
    }
}
