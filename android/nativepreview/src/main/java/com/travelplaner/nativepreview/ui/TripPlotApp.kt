package com.travelplaner.nativepreview.ui

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*

private data class Tab(val route: String, val label: String, val icon: ImageVector, val tag: String)
private val tabs = listOf(
    Tab("trips", "내 여행", Icons.Outlined.Luggage, "trips"),
    Tab("map", "지도", Icons.Outlined.Map, "map"),
    Tab("saved", "저장", Icons.Outlined.BookmarkBorder, "saved"),
    Tab("expenses", "지출", Icons.Outlined.AccountBalanceWallet, "expenses"),
    Tab("more", "더보기", Icons.Outlined.MoreHoriz, "more"),
)

private val lightColors = lightColorScheme(
    primary = Color(0xFF416C62), onPrimary = Color.White,
    primaryContainer = Color(0xFFDDECE3), onPrimaryContainer = Color(0xFF193C33),
    secondary = Color(0xFF667C89), secondaryContainer = Color(0xFFE3EDF3),
    background = Color(0xFFF8FAF7), surface = Color(0xFFF8FAF7),
    surfaceContainer = Color(0xFFEEF2ED), surfaceContainerLow = Color(0xFFF1F5EF),
    surfaceContainerLowest = Color.White,
    onSurface = Color(0xFF25372F), onSurfaceVariant = Color(0xFF637269),
    outlineVariant = Color(0xFFDCE3DC),
)
private val darkColors = darkColorScheme(
    primary = Color(0xFFA8D0BD), onPrimary = Color(0xFF17392E),
    primaryContainer = Color(0xFF315348), onPrimaryContainer = Color(0xFFDDECE3),
    background = Color(0xFF131B17), surface = Color(0xFF131B17),
    surfaceContainer = Color(0xFF24312A), surfaceContainerLow = Color(0xFF1C2721),
    surfaceContainerLowest = Color(0xFF18231D),
    onSurface = Color(0xFFE0E9E1), onSurfaceVariant = Color(0xFFB0BEB3),
)

@Composable
fun TripPlotApp(model: TripViewModel, backupModel: TripBackupViewModel, lastLocation: String, onLocation: (String) -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColors else lightColors) {
        val state by model.state.collectAsStateWithLifecycle()
        val context=LocalContext.current
        val workspacePreferences=remember(context) { context.getSharedPreferences("native.workspace",android.content.Context.MODE_PRIVATE) }
        var activeTripID by rememberSaveable { mutableStateOf(workspacePreferences.getString("activeTrip","") ?: "") }
        fun selectActiveTrip(id:String) { activeTripID=id; workspacePreferences.edit().putString("activeTrip",id).apply() }
        val nav = rememberNavController()
        val entry by nav.currentBackStackEntryAsState()
        var restored by rememberSaveable { mutableStateOf(false) }
        LaunchedEffect(state.loading) {
            if (!state.loading && state.readError == null && !restored) {
                if (lastLocation.startsWith("trips/detail/")) {
                    val id = Uri.decode(lastLocation.removePrefix("trips/detail/"))
                    if (state.trips.any { it.id == id }) nav.navigate(lastLocation) { launchSingleTop = true }
                } else if (tabs.any { it.route == lastLocation && it.route != "trips" }) {
                    // Restore through the same stack-saving path as a tab tap. Otherwise
                    // the first return to Trips can associate the More stack with Trips.
                    nav.navigate(lastLocation) {
                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                }
                restored = true
            }
        }
        LaunchedEffect(entry, restored) {
            if (restored) {
                val route = entry?.destination?.route
                when {
                    route == "trips/detail/{id}" -> onLocation("trips/detail/" + Uri.encode(entry?.arguments?.getString("id")))
                    route == "trips/list" -> onLocation("trips/list")
                    tabs.any { it.route == route } -> route?.let(onLocation)
                }
            }
        }
        Scaffold(
            modifier = Modifier.fillMaxSize().imePadding().semantics { testTagsAsResourceId = true },
            containerColor = MaterialTheme.colorScheme.background,
            contentWindowInsets = WindowInsets.safeDrawing,
            bottomBar = {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
                    tabs.forEach { tab ->
                        val selected = entry?.destination?.hierarchy?.any { it.route == tab.route } == true
                        NavigationBarItem(
                            selected = selected,
                            enabled = restored || state.readError != null,
                            onClick = {
                                if (!selected) nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.label, maxLines = 1) },
                            modifier = Modifier.testTag("tab-" + tab.tag),
                        )
                    }
                }
            },
        ) { padding ->
            NavHost(
                navController = nav,
                startDestination = "trips",
                modifier = Modifier.padding(padding).consumeWindowInsets(padding),
            ) {
                navigation(startDestination = "trips/list", route = "trips") {
                    composable("trips/list") {
                        TripList(state, model::refresh,
                            onCreate = { nav.navigate("trips/editor/new") },
                            onOpen = { nav.navigate("trips/detail/" + Uri.encode(it)) })
                    }
                    composable("trips/detail/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { detail ->
                        val id = detail.arguments?.getString("id")
                        val trip = state.trips.find { it.id == id }
                        LaunchedEffect(trip?.id) { trip?.let { selectActiveTrip(it.id) } }
                        when {
                            state.loading -> Loading()
                            state.readError != null -> ReadError(state.readError!!, model::refresh)
                            trip == null -> MissingTrip { nav.popBackStack("trips/list", false) }
                            else -> TripDetail(trip, onBack = { nav.popBackStack() },
                                onEdit = { nav.navigate("trips/editor/" + Uri.encode(trip.id)) },
                                onItinerary = { nav.navigate("trips/itinerary/" + Uri.encode(trip.id)) },
                                onBackup = { nav.navigate("backup?trip=" + Uri.encode(trip.id)) })
                        }
                    }
                    composable("trips/itinerary/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { detail ->
                        val id = detail.arguments?.getString("id")
                        val trip = state.trips.find { it.id == id }
                        if (trip != null) TripWorkspaceScreen(trip, state, { nav.popBackStack() }, { section, key ->
                            nav.navigate("trips/place/" + Uri.encode(trip.id) + "/" + section.token + "/" + Uri.encode(key?.token ?: "new"))
                        }, { model.applySchedule(trip.id, it) }, {selection,draft,operation -> model.saveFavorite(selection,draft,operation); Unit})
                        else MissingTrip { nav.popBackStack("trips/list", false) }
                    }
                    composable("trips/place/{id}/{section}/{item}", arguments = listOf(navArgument("id") { type = NavType.StringType }, navArgument("section") { type = NavType.IntType }, navArgument("item") { type = NavType.StringType })) { form ->
                        val id = requireNotNull(form.arguments?.getString("id")); val number = form.arguments?.getInt("section") ?: 1
                        val token = requireNotNull(form.arguments?.getString("item"))
                        val section = if (number == 0) ScheduleSection.Reserve else ScheduleSection.Day(number)
                        val item = if (token == "new") null else ItemKey.fromToken(token)
                        val key = JsonArray(listOf(id, number.toString(), token).map(::JsonPrimitive)).toString()
                        LaunchedEffect(key, state.loading) { if (!state.loading) model.openPlace(key, id, section, item) }
                        val editor = state.placeEditors[key]
                        LaunchedEffect(editor?.saved) { if (editor?.saved == true) { nav.popBackStack(); model.acknowledgePlace(key) } }
                        if (editor != null) PlaceEditorScreen(editor, { nav.popBackStack() }, { model.changePlace(key, it) }, { model.savePlace(key) })
                        else if (state.loading) Loading() else MissingTrip { nav.popBackStack() }
                    }
                    composable("trips/editor/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { form ->
                        val key = requireNotNull(form.arguments?.getString("id"))
                        LaunchedEffect(key, state.loading) { if (!state.loading) model.openDraft(key) }
                        val editor = state.editors[key]
                        LaunchedEffect(editor?.savedTripId) {
                            editor?.savedTripId?.let { id ->
                                nav.navigate("trips/detail/" + Uri.encode(id)) {
                                    popUpTo("trips/list")
                                    launchSingleTop = true
                                }
                                model.acknowledgeSave(key)
                            }
                        }
                        when {
                            editor != null -> TripEditor(key == "new", editor,
                                onBack = { nav.popBackStack() },
                                onChange = { model.changeDraft(key, it) },
                                onSave = { model.saveDraft(key) })
                            state.loading -> Loading()
                            state.readError != null -> ReadError(state.readError!!, model::refresh)
                            else -> MissingTrip { nav.popBackStack("trips/list", false) }
                        }
                    }
                }
                composable("map") { PlaceSearchScreen(model,state,activeTripID,::selectActiveTrip) }
                composable("saved") { SavedPlacesScreen(model,state,activeTripID,::selectActiveTrip) }
                composable("expenses") { ExpenseScreen(state, model, activeTripID) { tripID -> nav.navigate("expenses/settlement/" + Uri.encode(tripID)) } }
                composable("expenses/settlement/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { detail ->
                    SettlementScreen(state, model, requireNotNull(detail.arguments?.getString("id"))) { nav.popBackStack() }
                }
                composable("more") { MoreScreen(activeTripID, { nav.navigate("more/memory/" + Uri.encode(activeTripID)) }, { nav.navigate("more/prep/" + Uri.encode(activeTripID)) }, { nav.navigate("more/details/" + Uri.encode(activeTripID)) }, { nav.navigate("backup?trip=") }) }
                composable("more/memory/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                    val trip = state.trips.find { it.id == entry.arguments?.getString("id") }
                    if (trip == null) MissingTrip { nav.popBackStack("more", false) } else TravelMemoryScreen(trip, model, { nav.popBackStack() }) { change, photo, stagedPhoto, onComplete -> model.applyMemoryChange(trip.id, change, photo, stagedPhoto, onComplete) }
                }
                composable("more/prep/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                    val trip = state.trips.find { it.id == entry.arguments?.getString("id") }
                    if (trip == null) MissingTrip { nav.popBackStack("more", false) } else TravelPrepScreen(trip, { nav.popBackStack() }) { change -> model.applyMemoryChange(trip.id, change) }
                }
                composable("more/details/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                    val trip = state.trips.find { it.id == entry.arguments?.getString("id") }
                    if (trip == null) MissingTrip { nav.popBackStack("more", false) } else TravelDetailsScreen(trip, { nav.popBackStack() }) { change -> model.applyMemoryChange(trip.id, change) }
                }
                composable("backup?trip={trip}", arguments = listOf(navArgument("trip") { type = NavType.StringType; defaultValue = "" })) { detail ->
                    TripBackupScreen(backupModel, state.trips, detail.arguments?.getString("trip") ?: "", { nav.popBackStack() }, model::refresh)
                }
            }
        }
    }
}

@Composable
private fun BrandHeader() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(38.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.Explore, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(25.dp))
        }
        Text("TripPlot", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        Text("미리보기", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TripList(state: TripUiState, retry: () -> Unit, onCreate: () -> Unit, onOpen: (String) -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("trip-list"),
        contentPadding = PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item { BrandHeader() }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("나의 다음 여행", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
                Text("떠나고 싶은 마음부터, 차근차근.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        when {
            state.loading -> item { Loading() }
            state.readError != null -> item { ReadError(state.readError, retry) }
            else -> {
                item {
                    Button(onClick = onCreate, modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp).testTag("trip-create"), shape = RoundedCornerShape(18.dp)) {
                        Icon(Icons.Outlined.Add, null)
                        Spacer(Modifier.width(8.dp))
                        Text("여행 만들기", style = MaterialTheme.typography.titleSmall)
                    }
                }
                if (state.trips.isEmpty()) item {
                    CalmCard {
                        Illustration(Icons.Outlined.Luggage)
                        Text("첫 여행을 계획해 볼까요?", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                        Text("여행 이름과 날짜를 정해 보세요.\n로그인 없이 이 기기에 저장돼요.", color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 25.sp)
                    }
                }
                if (state.trips.isNotEmpty()) item {
                    Text("내 여행 · " + state.trips.size, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                items(state.trips, key = { it.id }) { trip ->
                    Card(
                        onClick = { onOpen(trip.id) },
                        modifier = Modifier.fillMaxWidth().testTag("trip-row-" + trip.id),
                        shape = RoundedCornerShape(24.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest),
                    ) {
                        Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(trip.country.ifBlank { "나만의 여행" }, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                                Text(trip.dayCount.toString() + "일", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(trip.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(trip.startDate + " → " + trip.endDate, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Icon(Icons.AutoMirrored.Outlined.ArrowForward, "여행 상세 보기", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
                item { LocalStorageNote() }
            }
        }
    }
}

@Composable
private fun TripDetail(trip: TripDocument, onBack: () -> Unit, onEdit: () -> Unit, onItinerary: () -> Unit, onBackup: () -> Unit) {
    BackHandler { onBack() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        ScreenHeader("여행 정보", onBack)
        CalmCard {
            Illustration(Icons.Outlined.FlightTakeoff)
            Text(trip.country.ifBlank { "나만의 여행" }, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            Text(trip.name, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.testTag("trip-detail-title").semantics { heading() })
            Text(trip.startDate + " → " + trip.endDate, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) {
                Text(trip.dayCount.toString() + "일", modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.SemiBold)
            }
        }
        Button(onClick = onEdit, modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp).testTag("trip-edit"), shape = RoundedCornerShape(18.dp)) {
            Icon(Icons.Outlined.Edit, null)
            Spacer(Modifier.width(8.dp))
            Text("여행 정보 수정")
        }
        Button(onClick = onItinerary, modifier = Modifier.fillMaxWidth().testTag("openItinerary")) { Text("일정·예비 목록 편집") }
        OutlinedButton(onClick = onBackup, modifier = Modifier.fillMaxWidth()) { Text("여행 JSON 백업") }
        InfoPanel(Icons.Outlined.CalendarMonth, "일정을 직접 준비해보세요", "장소 추가·이동·시간·메모 편집과 여행 백업을 사용할 수 있어요. 지도·일정 화면은 자유롭게 나눌 수 있습니다.")
        LocalStorageNote()
    }
}

@Composable
internal fun TripEditor(isNew: Boolean, editor: EditorState, onBack: () -> Unit, onChange: (TripDraft) -> Unit, onSave: () -> Unit) {
    val focus = LocalFocusManager.current
    BackHandler(enabled = !editor.saving) { onBack() }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp).testTag("trip-form"),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        ScreenHeader(if (isNew) "여행 만들기" else "여행 정보 수정", onBack, !editor.saving)
        Text(if (isNew) "어디로 떠나볼까요?" else "여행의 계획을 다듬어요", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("날짜는 시작일을 포함해 1~100일로 정할 수 있어요.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        DraftField("여행 이름", "예: 가을의 오사카", editor.draft.name, "trip-name", !editor.saving) { onChange(editor.draft.copy(name = it)) }
        DraftField("국가 (선택)", "예: 일본", editor.draft.country, "trip-country", !editor.saving) { onChange(editor.draft.copy(country = it)) }
        DraftField("시작일", "YYYY-MM-DD", editor.draft.startDate, "trip-start", !editor.saving, isDate = true) { onChange(editor.draft.copy(startDate = it)) }
        DraftField("종료일", "YYYY-MM-DD", editor.draft.endDate, "trip-end", !editor.saving, isDate = true, last = true) { onChange(editor.draft.copy(endDate = it)) }
        editor.error?.let { message -> ErrorPanel(message, "form-error") }
        Button(
            onClick = { focus.clearFocus(); onSave() },
            enabled = !editor.saving,
            modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp).testTag("trip-save"),
            shape = RoundedCornerShape(18.dp),
        ) {
            if (editor.saving) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                Spacer(Modifier.width(10.dp))
            }
            Text(if (editor.saving) "저장 중…" else if (isNew) "여행 저장" else "변경 사항 저장")
        }
        Text("작성 중인 내용은 뒤로 가거나 탭을 바꿔도 유지돼요. 저장 버튼을 누르면 이 기기에 기록돼요.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 20.sp)
        if (!isNew) Text("기간을 줄일 때 제외되는 날짜에 정보가 있으면 저장할 수 없어요. 기존 일정과 지출 정보는 그대로 보존돼요.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 20.sp)
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun DraftField(label: String, placeholder: String, value: String, tag: String, enabled: Boolean, isDate: Boolean = false, last: Boolean = false, onChange: (String) -> Unit) {
    val focus = LocalFocusManager.current
    OutlinedTextField(
        value = value, onValueChange = onChange,
        label = { Text(label) }, placeholder = { Text(placeholder) },
        supportingText = if (isDate) ({ Text("예: 2026-10-10") }) else null,
        modifier = Modifier.fillMaxWidth().testTag(tag),
        enabled = enabled, singleLine = true, shape = RoundedCornerShape(16.dp),
        keyboardOptions = KeyboardOptions(keyboardType = if (isDate) KeyboardType.Ascii else KeyboardType.Text, imeAction = if (last) ImeAction.Done else ImeAction.Next),
        keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }),
    )
}

@Composable
fun ScreenHeader(title: String, onBack: () -> Unit, enabled: Boolean = true) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        IconButton(onClick = onBack, enabled = enabled, modifier = Modifier.testTag("trip-back")) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, "뒤로 가기")
        }
        Text(title, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun FeaturePreview(feature: String, title: String, description: String, icon: ImageVector) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
        BrandHeader()
        Text(feature, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        CalmCard {
            Illustration(icon)
            Text(feature + " 미리보기", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 26.sp)
        }
        Text("지금 이용 가능 · 여행 생성, 조회, 수정", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun MoreScreen(activeTripID: String, onMemory: () -> Unit, onPrep: () -> Unit, onDetails: () -> Unit, onBackup: () -> Unit) {
    val uriHandler=androidx.compose.ui.platform.LocalUriHandler.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        BrandHeader()
        Text("더보기", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        if (activeTripID.isNotBlank()) {
            OutlinedButton(onClick = onMemory, modifier = Modifier.fillMaxWidth().testTag("openMemory")) { Text("여행 기록·사진") }
            OutlinedButton(onClick = onPrep, modifier = Modifier.fillMaxWidth().testTag("openPrep")) { Text("여행 준비 체크리스트") }
            OutlinedButton(onClick = onDetails, modifier = Modifier.fillMaxWidth().testTag("openDetails")) { Text("항공·숙소 정보") }
        } else {
            Text("내 여행에서 여행을 하나 선택하면 기록·준비 메뉴가 열립니다.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Button(onClick = onBackup, modifier = Modifier.fillMaxWidth().testTag("backupImport")) { Text("여행 백업 가져오기·내보내기") }
        InfoPanel(Icons.Outlined.PhoneAndroid, "이 기기에만 저장돼요", "로그인과 인터넷 연결 없이 여행을 만들고 수정할 수 있어요. 저장한 여행은 앱을 다시 열어도 남아 있어요.")
        InfoPanel(Icons.Outlined.CloudOff, "동기화는 아직 연결되지 않았어요", "기존 웹·앱의 여행은 자동으로 가져오지 않아요. 이 미리보기의 여행도 다른 기기나 계정으로 전송되지 않아요.")
        InfoPanel(Icons.Outlined.Construction, "네이티브 기능을 연결하고 있어요", "저장 장소와 지도·일정 자유 분할을 사용할 수 있어요. 실제 지도·검색에는 별도 네이티브 지도 키가 필요합니다. 지출·정산과 계정 동기화는 후속 단계입니다.")
        Text("여행 JSON 백업에는 전역 저장 장소가 포함되지 않습니다. 새 Google 검색 장소는 직접 입력한 이름과 장소 ID만 보관하며, 현재 웹에서는 해당 위치의 자동 복원을 지원하지 않습니다.",style=MaterialTheme.typography.bodySmall)
        TextButton(onClick={uriHandler.openUri("https://travelplaner-545.pages.dev/privacy.html")}) {Text("개인정보처리방침")}
        TextButton(onClick={uriHandler.openUri("https://travelplaner-545.pages.dev/terms.html")}) {Text("이용약관")}
        InfoPanel(Icons.Outlined.Info, "미리보기 데이터를 보관하려면", "앱을 삭제하거나 앱 데이터를 지우면 저장한 여행도 사라져요. 중요한 원본 여행 정보는 별도로 보관해 주세요.")
        Text("TripPlot · Native Preview", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CalmCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLowest, shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(26.dp), verticalArrangement = Arrangement.spacedBy(16.dp), content = content)
    }
}

@Composable
private fun Illustration(icon: ImageVector) {
    Box(Modifier.size(92.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(30.dp)), contentAlignment = Alignment.Center) {
        Icon(icon, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.primary)
        Box(Modifier.align(Alignment.BottomEnd).offset(5.dp, 5.dp).size(27.dp).background(MaterialTheme.colorScheme.secondaryContainer, CircleShape))
    }
}

@Composable
private fun InfoPanel(icon: ImageVector, title: String, description: String) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = RoundedCornerShape(22.dp)) {
        Column(Modifier.fillMaxWidth().padding(22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 24.sp)
        }
    }
}

@Composable
private fun LocalStorageNote() {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.PhoneAndroid, null, Modifier.size(17.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("이 기기에 저장 · 계정 동기화 미연결", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Loading() {
    Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
private fun ErrorPanel(message: String, tag: String) {
    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().testTag(tag).semantics { liveRegion = LiveRegionMode.Polite }) {
        Text(message, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(18.dp), lineHeight = 24.sp)
    }
}

@Composable
private fun ReadError(message: String, retry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ErrorPanel(message, "read-error")
        OutlinedButton(onClick = retry) { Text("다시 불러오기") }
    }
}

@Composable
private fun MissingTrip(onList: () -> Unit) {
    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("여행을 찾을 수 없어요.", style = MaterialTheme.typography.titleLarge)
        Text("목록에서 여행을 다시 선택해 주세요.")
        Button(onClick = onList) { Text("내 여행으로 돌아가기") }
    }
}
