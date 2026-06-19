import numpy as np

ZONE_SUPPORT = 1
ZONE_RESIST  = 2
ZONE_WEAK      = 0
ZONE_TURNCOAT  = 1
ZONE_UNTESTED  = 2
ZONE_VERIFIED  = 3
ZONE_PROVEN    = 4
UP_POINT =  1
DN_POINT = -1

def calculate_atr(high, low, close, period, i):
    if i < period:
        return 0.0
    tr_sum = 0.0
    for k in range(period):
        idx = i - k
        if idx == 0:
            tr = high[idx] - low[idx]
        else:
            tr = max(high[idx] - low[idx],
                     abs(high[idx] - close[idx-1]),
                     abs(low[idx]  - close[idx-1]))
        tr_sum += tr
    return tr_sum / period

def fractal(high, low, n, M, P, shift):
    if shift < P or shift > n - P - 1:
        return False
    if M == UP_POINT:
        for i in range(1, P+1):
            if high[shift - i] > high[shift]:
                return False
            if shift + i < n and high[shift + i] >= high[shift]:
                return False
    else:
        for i in range(1, P+1):
            if low[shift - i] < low[shift]:
                return False
            if shift + i < n and low[shift + i] <= low[shift]:
                return False
    return True

def calculate_supply_demand(df,
                             back_limit=1000,
                             zone_fuzzfactor=0.75,
                             fractal_fast_factor=3.0,
                             fractal_slow_factor=6.0,
                             zone_show_weak=True,
                             zone_show_untested=True,
                             zone_show_turncoat=False,
                             zone_merge=True,
                             zone_extend=True):

    high  = df['high'].values.astype(float)
    low   = df['low'].values.astype(float)
    close = df['close'].values.astype(float)
    n     = len(df)
    times = [int(df.index[i].timestamp()) for i in range(n)]

    # timeframe period in minutes — infer from data
    if n > 1:
        diff = (df.index[1] - df.index[0]).seconds // 60
        period = max(1, diff)
    else:
        period = 15

    fast_P = max(1, int(period * fractal_fast_factor))
    slow_P = max(1, int(period * fractal_slow_factor))

    # convert factor to bar count (MQL4: P/Period()*2 + ceil(P/Period()/2))
    fast_bars = int(fast_P / period * 2 + np.ceil(fast_P / period / 2))
    slow_bars = int(slow_P / period * 2 + np.ceil(slow_P / period / 2))
    fast_bars = max(2, fast_bars)
    slow_bars = max(2, slow_bars)

    limit = min(n - 1, back_limit)

    # compute fast and slow fractal arrays
    fast_up = np.zeros(n)
    fast_dn = np.zeros(n)
    slow_up = np.zeros(n)
    slow_dn = np.zeros(n)

    for shift in range(limit, 1, -1):
        if fractal(high, low, n, UP_POINT, fast_bars, shift):
            fast_up[shift] = high[shift]
        if fractal(high, low, n, DN_POINT, fast_bars, shift):
            fast_dn[shift] = low[shift]
        if fractal(high, low, n, UP_POINT, slow_bars, shift):
            slow_up[shift] = high[shift]
        if fractal(high, low, n, DN_POINT, slow_bars, shift):
            slow_dn[shift] = low[shift]

    # find zones
    temp_hi       = []
    temp_lo       = []
    temp_start    = []
    temp_hits     = []
    temp_strength = []
    temp_turn     = []

    for shift in range(limit, 5, -1):
        atr = calculate_atr(high, low, close, 7, shift)
        fu  = atr / 2.0 * zone_fuzzfactor

        if fast_up[shift] > 0.001:
            is_weak = slow_up[shift] <= 0.001
            hival   = high[shift] + fu if zone_extend else high[shift]
            loval   = max(min(close[shift], high[shift] - fu), high[shift] - fu * 2)
            turned = False
            has_turned = False
            bust_count = 0
            test_count = 0
            is_bust    = False

            for i in range(shift - 1, -1, -1):
                if not turned:
                    touch = fast_up[i] >= loval and fast_up[i] <= hival
                else:
                    touch = fast_dn[i] <= hival and fast_dn[i] >= loval

                if touch:
                    touch_ok = True
                    for j in range(i + 1, min(i + 11, n)):
                        if not turned:
                            if fast_up[j] >= loval and fast_up[j] <= hival:
                                touch_ok = False
                                break
                        else:
                            if fast_dn[j] <= hival and fast_dn[j] >= loval:
                                touch_ok = False
                                break
                    if touch_ok:
                        bust_count = 0
                        test_count += 1

                busted = (not turned and high[i] > hival) or (turned and low[i] < loval)
                if busted:
                    bust_count += 1
                    if bust_count > 1 or is_weak:
                        is_bust = True
                        break
                    turned = not turned
                    has_turned = True
                    test_count = 0

            if not is_bust:
                if test_count > 3:   strength = ZONE_PROVEN
                elif test_count > 0: strength = ZONE_VERIFIED
                elif has_turned:     strength = ZONE_TURNCOAT
                elif not is_weak:    strength = ZONE_UNTESTED
                else:                strength = ZONE_WEAK

                temp_hi.append(hival)
                temp_lo.append(loval)
                temp_turn.append(has_turned)
                temp_hits.append(test_count)
                temp_start.append(shift)
                temp_strength.append(strength)

        elif fast_dn[shift] > 0.001:
            is_weak = slow_dn[shift] <= 0.001
            loval   = low[shift] - fu if zone_extend else low[shift]
            hival   = min(max(close[shift], low[shift] + fu), low[shift] + fu * 2)
            turned = False
            has_turned = False
            bust_count = 0
            test_count = 0
            is_bust    = False

            for i in range(shift - 1, -1, -1):
                if turned:
                    touch = fast_up[i] >= loval and fast_up[i] <= hival
                else:
                    touch = fast_dn[i] <= hival and fast_dn[i] >= loval

                if touch:
                    touch_ok = True
                    for j in range(i + 1, min(i + 11, n)):
                        if turned:
                            if fast_up[j] >= loval and fast_up[j] <= hival:
                                touch_ok = False
                                break
                        else:
                            if fast_dn[j] <= hival and fast_dn[j] >= loval:
                                touch_ok = False
                                break
                    if touch_ok:
                        bust_count = 0
                        test_count += 1

                busted = (turned and high[i] > hival) or (not turned and low[i] < loval)
                if busted:
                    bust_count += 1
                    if bust_count > 1 or is_weak:
                        is_bust = True
                        break
                    turned = not turned
                    has_turned = True
                    test_count = 0

            if not is_bust:
                if test_count > 3:   strength = ZONE_PROVEN
                elif test_count > 0: strength = ZONE_VERIFIED
                elif has_turned:     strength = ZONE_TURNCOAT
                elif not is_weak:    strength = ZONE_UNTESTED
                else:                strength = ZONE_WEAK

                temp_hi.append(hival)
                temp_lo.append(loval)
                temp_turn.append(has_turned)
                temp_hits.append(test_count)
                temp_start.append(shift)
                temp_strength.append(strength)

    temp_count = len(temp_hi)
    temp_hits_arr     = list(temp_hits)
    temp_merged       = [False] * temp_count

    # merge overlapping zones
    if zone_merge and temp_count > 1:
        for _ in range(3):
            merge_pairs = []
            merged_flags = [False] * temp_count
            for i in range(temp_count - 1):
                if temp_hits_arr[i] == -1 or merged_flags[i]:
                    continue
                for j in range(i + 1, temp_count):
                    if temp_hits_arr[j] == -1 or merged_flags[j]:
                        continue
                    overlap = (
                        (temp_hi[i] >= temp_lo[j] and temp_hi[i] <= temp_hi[j]) or
                        (temp_lo[i] <= temp_hi[j] and temp_lo[i] >= temp_lo[j]) or
                        (temp_hi[j] >= temp_lo[i] and temp_hi[j] <= temp_hi[i]) or
                        (temp_lo[j] <= temp_hi[i] and temp_lo[j] >= temp_lo[i])
                    )
                    if overlap:
                        merge_pairs.append((i, j))
                        merged_flags[i] = True
                        merged_flags[j] = True

            if not merge_pairs:
                break

            for tgt, src in merge_pairs:
                temp_hi[tgt]       = max(temp_hi[tgt], temp_hi[src])
                temp_lo[tgt]       = min(temp_lo[tgt], temp_lo[src])
                temp_hits_arr[tgt] += temp_hits_arr[src]
                temp_start[tgt]    = max(temp_start[tgt], temp_start[src])
                temp_strength[tgt] = max(temp_strength[tgt], temp_strength[src])

                if temp_hits_arr[tgt] > 3:
                    temp_strength[tgt] = ZONE_PROVEN

                if temp_hits_arr[tgt] == 0 and not temp_turn[tgt]:
                    temp_hits_arr[tgt] = 1
                    if temp_strength[tgt] < ZONE_VERIFIED:
                        temp_strength[tgt] = ZONE_VERIFIED

                if not temp_turn[tgt] or not temp_turn[src]:
                    temp_turn[tgt] = False
                if temp_turn[tgt]:
                    temp_hits_arr[tgt] = 0

                temp_hits_arr[src] = -1

    # build final zones
    zones = []
    current_close = close[-1] if n > 0 else 0

    for i in range(temp_count):
        if temp_hits_arr[i] < 0:
            continue

        hi  = temp_hi[i]
        lo  = temp_lo[i]
        st  = temp_start[i]
        hit = temp_hits_arr[i]
        trn = temp_turn[i]
        sth = temp_strength[i]

        if hi < current_close:
            zone_type = ZONE_SUPPORT
        elif lo > current_close:
            zone_type = ZONE_RESIST
        else:
            zone_type = ZONE_SUPPORT
            for j in range(4, min(1000, n)):
                idx = n - 1 - j
                if idx < 0:
                    break
                if close[idx] < lo:
                    zone_type = ZONE_RESIST
                    break
                elif close[idx] > hi:
                    zone_type = ZONE_SUPPORT
                    break

        if sth == ZONE_WEAK and not zone_show_weak:
            continue
        if sth == ZONE_UNTESTED and not zone_show_untested:
            continue
        if sth == ZONE_TURNCOAT and not zone_show_turncoat:
            continue

        strength_name = {
            ZONE_WEAK:     'Weak',
            ZONE_TURNCOAT: 'Turncoat',
            ZONE_UNTESTED: 'Untested',
            ZONE_VERIFIED: 'Verified',
            ZONE_PROVEN:   'Proven',
        }.get(sth, 'Weak')

        zones.append({
            'hi':         round(float(hi), 4),
            'lo':         round(float(lo), 4),
            'start_time': times[st] if st < n else times[-1],
            'hits':       int(hit),
            'turned':     bool(trn),
            'strength':   int(sth),
            'strength_name': strength_name,
            'type':       'support' if zone_type == ZONE_SUPPORT else 'resist',
        })

    return zones