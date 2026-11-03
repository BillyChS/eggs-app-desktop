namespace EggsApp.Desktop;

/// <summary>
/// Spanish text shown by the desktop shell. The React app has its own.
/// </summary>
internal static class UiText
{
    public const string StartFailed =
        "No se pudo abrir Eggs App.\n\nCierre este mensaje e intente abrirla de nuevo.";

    public const string FrontendMissing =
        "No se pudo abrir Eggs App porque faltan archivos de la aplicación.\n\nHay que volver a instalarla.";

    public const string FrontendMissingInDebug =
        "Falta la interfaz compilada.\n\nEjecute \"pnpm build\" en src/web y vuelva a abrir la aplicación.";

    public const string WebView2Missing =
        "No se pudo abrir Eggs App porque falta un componente de Windows: Microsoft Edge WebView2 Runtime.\n\n"
        + "Hay que instalarlo para poder usar la aplicación.";

    public const string UnexpectedError =
        "Ocurrió un error inesperado y Eggs App se va a cerrar.\n\nVuelva a abrirla para seguir trabajando.";

    public const string BrowserClosed =
        "La pantalla de Eggs App se cerró de forma inesperada y la aplicación se va a cerrar.\n\n"
        + "Vuelva a abrirla para seguir trabajando.";

    public const string ReloadPrompt =
        "La pantalla de Eggs App dejó de responder.\n\n¿Desea volver a cargarla?";

    public const string LogFolderHint =
        "Si el problema continúa, envíe los archivos de esta carpeta a quien le ayuda con la aplicación:";

    public const string Accept = "Aceptar";
    public const string Yes = "Sí";
    public const string No = "No";
    public const string Opening = "Abriendo…";
}
